import { isJapaneseKnownWordList, isKnownHeadwordList } from '@/services/storage/known-words';
import { browser } from 'wxt/browser';
import { AnkiClient } from '@/services/anki/client';
import { ensureReaderModel } from '@/services/anki/model';
import { listVocabulary, markHeadwordsKnown, markJapaneseWordsKnown, saveMachineTranslation } from '@/services/storage/vocabulary';
import { readDeckStatistics } from './statistics';
import { previewKnownWords } from '@/services/anki/import';
import { countUnsynced, syncVocabulary, validateAnkiSettings } from '@/services/anki/sync';
import { ANKI_DEFAULT_FIELDS, ANKI_FIELD_ROLES, DEFAULT_ANKI_SETTINGS, JAPANESE_ANKI_MODEL, type AnkiMessage, type AnkiResponse, type AnkiSettings } from '@/types/anki';
import { isOptionalReaderLanguage, type ReaderLanguage } from '@/types/language';

const STORAGE_KEY = 'ankiSettings';
const JAPANESE_PROFILE_KEY = 'japaneseAnkiProfile';
type DeckProfile = Pick<AnkiSettings, 'deckName' | 'modelName' | 'fields'>;
const defaultJapaneseProfile: DeckProfile = { deckName: '', modelName: JAPANESE_ANKI_MODEL, fields: ANKI_DEFAULT_FIELDS };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isConnection(value: Record<string, unknown>): boolean {
  return typeof value.port === 'number' && Number.isInteger(value.port) &&
    value.port > 0 && value.port <= 65535 && typeof value.apiKey === 'string';
}

function isDeckProfile(value: unknown): value is DeckProfile {
  if (!isRecord(value) || typeof value.deckName !== 'string' ||
    typeof value.modelName !== 'string' || !isRecord(value.fields)) return false;
  const fields = value.fields;
  return ANKI_FIELD_ROLES.every((role) => typeof fields[role] === 'string');
}

function isSettings(value: unknown): value is AnkiSettings {
  return isRecord(value) && isConnection(value) && isDeckProfile(value);
}

async function readProfiles() {
  const stored = await browser.storage.local.get([STORAGE_KEY, JAPANESE_PROFILE_KEY]);
  const ko = isSettings(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : DEFAULT_ANKI_SETTINGS;
  const ja = isDeckProfile(stored[JAPANESE_PROFILE_KEY]) ? stored[JAPANESE_PROFILE_KEY] : defaultJapaneseProfile;
  return { ko, ja };
}

function assertSeparateDecks(deck: string, other: string) {
  const a = deck.normalize('NFC').toLowerCase();
  const b = other.normalize('NFC').toLowerCase();
  if (a && b && (a === b || a.startsWith(`${b}::`) || b.startsWith(`${a}::`))) {
    throw new Error('Choose separate Korean and Japanese decks. One deck cannot contain the other.');
  }
}

let pendingSave = Promise.resolve();
function saveProfile(settings: AnkiSettings, language: ReaderLanguage = 'ko'): Promise<void> {
  const save = pendingSave.then(async () => {
    const { ko, ja } = await readProfiles();
    assertSeparateDecks(settings.deckName, language === 'ja' ? ko.deckName : ja.deckName);
    if (language === 'ko' && settings.modelName === JAPANESE_ANKI_MODEL) throw new Error('Choose a Korean note type.');
    await validateAnkiSettings(new AnkiClient(settings), settings);
    if (language === 'ja') {
      const { deckName, modelName, fields, port, apiKey } = settings;
      await browser.storage.local.set({
        [STORAGE_KEY]: { ...ko, port, apiKey },
        [JAPANESE_PROFILE_KEY]: { deckName, modelName, fields },
      });
    } else {
      await browser.storage.local.set({ [STORAGE_KEY]: settings });
    }
  });
  pendingSave = save.catch(() => {});
  return save;
}

export function isAnkiMessage(value: unknown): value is AnkiMessage {
  if (!isRecord(value) || !isOptionalReaderLanguage(value.language)) return false;

  switch (value.type) {
    case 'get-anki-settings':
    case 'get-anki-deck-statistics': return true;
    case 'create-japanese-anki-deck': return isConnection(value);
    case 'connect-anki': return isConnection(value) && typeof value.requestPermission === 'boolean';
    case 'get-anki-fields': return isConnection(value) && typeof value.modelName === 'string' && !!value.modelName;
    case 'save-anki-settings': return isSettings(value.settings);
    case 'count-unsynced': return isSettings(value.settings);
    case 'preview-anki-import':
      return isSettings(value.settings) && typeof value.deckName === 'string' && !!value.deckName.trim();
    case 'import-anki-words':
      return value.language === 'ja' ? isJapaneseKnownWordList(value.japaneseWords) && value.japaneseWords.length > 0
        : isKnownHeadwordList(value.headwords) && value.headwords.length > 0;
    case 'sync-anki':
      return isSettings(value.settings) && Array.isArray(value.translations) &&
        value.translations.every((translation) => isRecord(translation) &&
          typeof translation.headword === 'string' && !!translation.headword.trim() &&
          Array.isArray(translation.korean) && Array.isArray(translation.english) &&
          translation.korean.length > 0 && translation.korean.length <= 3 &&
          translation.korean.length === translation.english.length &&
          [...translation.korean, ...translation.english].every((text) => typeof text === 'string' && !!text.trim()));
    default: return false;
  }
}

export async function handleAnkiMessage(message: AnkiMessage): Promise<AnkiResponse> {
  const language = message.language ?? 'ko';
  if (message.type === 'get-anki-settings' || message.type === 'get-anki-deck-statistics') {
    const { ko, ja } = await readProfiles();
    const settings = language === 'ja'
      ? { ...ja, port: ko.port, apiKey: ko.apiKey }
      : ko;
    if (message.type === 'get-anki-deck-statistics') {
      try {
        return { ok: true, deckStatistics: await readDeckStatistics(settings, language) };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Could not load Anki deck statistics.',
          deckName: settings.deckName,
        };
      }
    }
    return { ok: true, settings };
  }
  if (message.type === 'save-anki-settings') {
    await saveProfile(message.settings, message.language);
    return { ok: true };
  }
  if (message.type === 'count-unsynced') {
    const profiles = await readProfiles();
    assertSeparateDecks(message.settings.deckName, profiles[language === 'ja' ? 'ko' : 'ja'].deckName);
    return { ok: true, unsynced: await countUnsynced(message.settings, language) };
  }
  if (message.type === 'preview-anki-import') {
    const profiles = await readProfiles();
    assertSeparateDecks(message.deckName, profiles[language === 'ja' ? 'ko' : 'ja'].deckName);
    return { ok: true, importPreview: await previewKnownWords(message.settings, message.deckName, language) };
  }
  if (message.type === 'import-anki-words') {
    return { ok: true, markedKnown: language === 'ja' ? await markJapaneseWordsKnown(message.japaneseWords!) : await markHeadwordsKnown(message.headwords) };
  }
  if (message.type === 'sync-anki') {
    const profiles = await readProfiles();
    assertSeparateDecks(message.settings.deckName, profiles[language === 'ja' ? 'ko' : 'ja'].deckName);
    if (language === 'ja' && (message.settings.deckName !== profiles.ja.deckName || message.settings.modelName !== profiles.ja.modelName)) {
      throw new Error('Save your Japanese deck and note type in Settings before syncing.');
    }
    if (language === 'ko') {
      if (message.settings.modelName === JAPANESE_ANKI_MODEL) throw new Error('Choose a Korean note type.');
      for (const translation of message.translations) await saveMachineTranslation(translation);
    }
    const entries = await listVocabulary(language);
    const keys = entries.filter((entry) => entry.contexts.length).map((entry) => entry.japanese?.id ?? entry.headword);
    return { ok: true, results: keys.length ? await syncVocabulary(message.settings, keys, language) : [] };
  }

  const client = new AnkiClient(message);
  if (message.type === 'create-japanese-anki-deck') {
    const { ko } = await readProfiles();
    assertSeparateDecks('Japanese Mining', ko.deckName);
    await client.request('createDeck', { deck: 'Japanese Mining' });
    return { ok: true };
  }
  if (message.type === 'get-anki-fields') {
    return { ok: true, fields: await client.request('modelFieldNames', { modelName: message.modelName }) };
  }

  if (message.requestPermission) {
    const access = await client.request('requestPermission', undefined);
    if (access?.permission !== 'granted') {
      throw new Error('Allow Korean Reader in Anki, or add its extension origin to AnkiConnect’s allowed origins.');
    }
    if (access.requireApiKey && !message.apiKey) {
      throw new Error('Enter the AnkiConnect API key in Connection settings and retry.');
    }
  }

  const version = await client.request('version', undefined);
  if (typeof version !== 'number' || version < 6) throw new Error('Update AnkiConnect to a version that supports API v6.');
  const [decks, existingModels] = await Promise.all([
    client.request('deckNames', undefined), client.request('modelNames', undefined),
  ]);
  let models = existingModels;
  try {
    models = await ensureReaderModel(client, existingModels, language === 'ja' ? JAPANESE_ANKI_MODEL : undefined);
  } catch {
    // Allow connecting with existing note types even if creating the default note type fails.
  }
  return { ok: true, decks, models: language === 'ko' ? models.filter((model) => model !== JAPANESE_ANKI_MODEL) : models };
}
