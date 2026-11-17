import { browser } from 'wxt/browser';
import { AnkiClient } from '@/services/anki/client';
import { importKnownHeadwords, listVocabulary, saveMachineTranslation } from '@/services/storage/vocabulary';
import { previewKnownWords } from '@/services/anki/import';
import { countUnsynced, syncVocabulary, validateAnkiSettings } from '@/services/anki/sync';
import { ANKI_FIELD_ROLES, DEFAULT_ANKI_SETTINGS, type AnkiMessage, type AnkiResponse, type AnkiSettings } from '@/types/anki';

const STORAGE_KEY = 'ankiSettings';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isConnection(value: Record<string, unknown>): boolean {
  return typeof value.port === 'number' && Number.isInteger(value.port) &&
    value.port > 0 && value.port <= 65535 && typeof value.apiKey === 'string';
}

function isSettings(value: unknown): value is AnkiSettings {
  if (!isRecord(value) || !isConnection(value) || typeof value.deckName !== 'string' ||
    typeof value.modelName !== 'string' || !isRecord(value.fields)) return false;
  const fields = value.fields;
  return ANKI_FIELD_ROLES.every((role) => typeof fields[role] === 'string');
}

export function isAnkiMessage(value: unknown): value is AnkiMessage {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case 'get-anki-settings': return true;
    case 'connect-anki': return isConnection(value) && typeof value.requestPermission === 'boolean';
    case 'get-anki-fields': return isConnection(value) && typeof value.modelName === 'string' && !!value.modelName;
    case 'save-anki-settings': return isSettings(value.settings);
    case 'count-unsynced': return isSettings(value.settings);
    case 'preview-anki-import':
      return isSettings(value.settings) && typeof value.deckName === 'string' && !!value.deckName.trim();
    case 'import-anki-words':
      return Array.isArray(value.headwords) && value.headwords.length > 0 &&
        value.headwords.every((word) => typeof word === 'string' && /\p{Script=Hangul}/u.test(word));
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
  if (message.type === 'get-anki-settings') {
    const stored: unknown = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
    return { ok: true, settings: isSettings(stored) ? stored : DEFAULT_ANKI_SETTINGS };
  }
  if (message.type === 'save-anki-settings') {
    const { settings } = message;
    await validateAnkiSettings(new AnkiClient(settings), settings);
    await browser.storage.local.set({ [STORAGE_KEY]: settings });
    return { ok: true };
  }
  if (message.type === 'count-unsynced') {
    return { ok: true, unsynced: await countUnsynced(message.settings) };
  }
  if (message.type === 'preview-anki-import') {
    return { ok: true, importPreview: await previewKnownWords(message.settings, message.deckName) };
  }
  if (message.type === 'import-anki-words') {
    return { ok: true, markedKnown: await importKnownHeadwords(message.headwords) };
  }
  if (message.type === 'sync-anki') {
    for (const translation of message.translations) await saveMachineTranslation(translation);
    const entries = await listVocabulary();
    const mined = entries.filter((entry) => entry.contexts.length);
    return { ok: true, results: mined.length ? await syncVocabulary(message.settings, mined.map((entry) => entry.headword)) : [] };
  }

  const client = new AnkiClient(message);
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
  const [decks, models] = await Promise.all([
    client.request('deckNames', undefined), client.request('modelNames', undefined),
  ]);
  return { ok: true, decks, models };
}
