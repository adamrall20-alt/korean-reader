import { isKnownHeadwordList } from '@/services/storage/known-words';
import { handleAnkiMessage, isAnkiMessage } from '@/services/anki/messages';
import type { HistoryResponse } from '@/types/statistics';
import {
  DEFAULT_SUBTITLE_APPEARANCE, isSubtitleAppearance, SUBTITLE_APPEARANCE_KEY, THEME_KEY,
  type InterfaceTheme, type PreferencesResponse,
} from '@/types/preferences';
import { browser } from 'wxt/browser';
import { frequencyRank } from '@/services/dictionary/frequency';
import { lookupKoreanWord } from '@/services/dictionary/krdict';
import { clearDictionaryCache } from '@/services/dictionary/cache';
import {
  vocabularyRevisionKey, type KnownHeadwordsResponse, type VocabularyMessage, type VocabularyRevision,
} from '@/types/vocabulary';
import { isOptionalReaderLanguage, type ReaderLanguage } from '@/types/language';
import { readKnownWordHistory } from '@/services/storage/statistics';
import { getVocabulary, listKnownHeadwords, markHeadwordsKnown, normalizeHeadword } from '@/services/storage/vocabulary';
import { handleVocabularyMessage, isVocabularyMessage } from '@/services/storage/vocabulary-messages';
import { tokenizeSubtitleLines } from '@/services/korean/kiwi';
import { lookupJapaneseWord, tokenizeJapaneseLines } from '@/services/japanese/analysis';
import { headwordAliases, nominalCopulaHeadwords } from '@/services/korean/dictionary-forms';
import type {
  GetSettingsMessage,
  LookupMessage,
  LookupResponse,
  PingMessage,
  PingResponse,
  SetKrDictApiKeyMessage,
  ClearDictionaryCacheMessage,
  SettingsResponse,
  TokenizeMessage,
  TokenizeResponse,
} from '@/types/messages';

const KRDICT_API_KEY_STORAGE = 'krDictApiKey';
/** Without changes, YouTube tabs reload every known headword; with changes, they patch their cached set. */
async function notifyVocabularyChanged(changes?: { known: string[]; unknown: string[] }, language?: ReaderLanguage) {
  const revision: VocabularyRevision = { id: crypto.randomUUID(), ...changes };
  await browser.storage.local.set({ [vocabularyRevisionKey(language)]: revision }).catch((error) => {
    console.warn('[Korean Reader] Could not notify subtitle tabs of vocabulary changes.', error);
  });
}

function knownStatusChanges(message: VocabularyMessage): { known: string[]; unknown: string[] } | undefined {
  const japanese = message.language === 'ja';
  switch (message.type) {
    case 'mine-word': return { known: [japanese ? message.entry.japanese!.id : normalizeHeadword(message.entry.headword)], unknown: [] };
    case 'mark-word-known': return { known: [japanese ? message.japanese!.id : normalizeHeadword(message.headword)], unknown: [] };
    case 'delete-vocabulary': return { known: [], unknown: [japanese ? message.lexemeId! : normalizeHeadword(message.headword)] };
    case 'set-vocabulary-status': {
      const key = japanese ? message.lexemeId! : normalizeHeadword(message.headword);
      return message.status === 'known' ? { known: [key], unknown: [] } : { known: [], unknown: [key] };
    }
    default: return undefined;
  }
}

function isPingMessage(message: unknown): message is PingMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'ping'
  );
}

function isTokenizeMessage(message: unknown): message is TokenizeMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'tokenize' &&
    isOptionalReaderLanguage((message as { language?: unknown }).language) &&
    Array.isArray((message as { lines?: unknown }).lines) &&
    (message as { lines: unknown[] }).lines.every((line) => typeof line === 'string')
  );
}

function isLookupMessage(message: unknown): message is LookupMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'lookup' &&
    isOptionalReaderLanguage((message as { language?: unknown }).language) &&
    typeof (message as { word?: unknown }).word === 'string' &&
    Array.isArray((message as { morphemes?: unknown }).morphemes) &&
    (message as { morphemes: unknown[] }).morphemes.every((morpheme) => {
      if (!morpheme || typeof morpheme !== 'object') return false;
      return 'text' in morpheme && typeof morpheme.text === 'string' &&
        'tag' in morpheme && typeof morpheme.tag === 'string';
    })
  );
}

function isGetSettingsMessage(message: unknown): message is GetSettingsMessage {
  return typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'get-settings';
}

function isSetKrDictApiKeyMessage(message: unknown): message is SetKrDictApiKeyMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'set-krdict-api-key' &&
    typeof (message as { apiKey?: unknown }).apiKey === 'string'
  );
}

function isClearDictionaryCacheMessage(message: unknown): message is ClearDictionaryCacheMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'clear-dictionary-cache'
  );
}

export default defineBackground(() => {
  console.info('[Korean Reader] Background service worker started.');

  browser.runtime.onInstalled.addListener((details) => {
    console.info(`[Korean Reader] Extension ${details.reason}.`);
  });

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (isPingMessage(message)) {
      const response: PingResponse = {
        ok: true,
        version: browser.runtime.getManifest().version,
      };
      sendResponse(response);
      return false;
    }

    if (isTokenizeMessage(message)) {
      const japanese = message.language === 'ja';
      const tokenize = japanese ? tokenizeJapaneseLines : tokenizeSubtitleLines;
      void tokenize(message.lines).then(
        (lines) => sendResponse({ ok: true, lines } satisfies TokenizeResponse),
        (error: unknown) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : japanese ? 'Japanese analysis failed.' : 'Korean analysis failed.',
          } satisfies TokenizeResponse),
      );
      return true;
    }

    if (isLookupMessage(message)) {
      if (message.language === 'ja') {
        void lookupJapaneseWord(message.word).then(async (entries) => {
          if (!entries.length) throw new Error('No Japanese dictionary match found.');
          const japaneseMatches = await Promise.all(entries.map(async (entry) => {
            const saved = await getVocabulary(entry.japanese!.id, 'ja').catch(() => undefined);
            return { entry, savedContexts: saved?.contexts, isKnown: saved?.status === 'known' };
          }));
          sendResponse({ ok: true, entry: entries[0], savedContexts: japaneseMatches[0]?.savedContexts, japaneseMatches } satisfies LookupResponse);
        }).catch((error: unknown) => sendResponse({
          ok: false, error: error instanceof Error ? error.message : 'Japanese dictionary lookup failed.',
        } satisfies LookupResponse));
        return true;
      }
      void browser.storage.local.get(KRDICT_API_KEY_STORAGE).then(async (settings) => {
        const apiKey = settings[KRDICT_API_KEY_STORAGE];

        if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
          sendResponse({
            ok: false,
            error: 'Add your KRDict API key in Settings before looking up words.',
          } satisfies LookupResponse);
          return;
        }

        const headwords = nominalCopulaHeadwords(message.morphemes);
        const known = new Set<string>();
        if (headwords) {
          const toCheck = [
            ...new Set(Object.values(headwords).flatMap((headword) => [headword, ...headwordAliases(headword)])),
          ];
          await Promise.all(toCheck.map(async (headword) => {
            const saved = await getVocabulary(headword).catch(() => undefined);
            if (saved?.status === 'known') known.add(headword);
          }));
        }
        const entry = await lookupKoreanWord(message.word, message.morphemes, apiKey, known);
        entry.frequencyRank = await frequencyRank(entry.headword).catch(() => undefined);
        const saved = await getVocabulary(entry.headword).catch(() => undefined);
        sendResponse({ ok: true, entry, savedContexts: saved?.contexts } satisfies LookupResponse);
      }).catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Dictionary lookup failed.',
        } satisfies LookupResponse);
      });
      return true;
    }

    const fromExtensionPage = sender.url?.startsWith(browser.runtime.getURL('/'));
    const fromWebPage = /^https?:\/\//.test(sender.url ?? '');

    if ((fromWebPage || fromExtensionPage) && typeof message === 'object' && message !== null &&
      'type' in message && message.type === 'get-known-headwords') {
      const language = 'language' in message ? message.language : undefined;
      if (!isOptionalReaderLanguage(language)) {
        sendResponse({ ok: false } satisfies KnownHeadwordsResponse);
        return false;
      }
      void listKnownHeadwords(language).then(
        (headwords) => sendResponse({ ok: true, headwords } satisfies KnownHeadwordsResponse),
        () => sendResponse({ ok: false } satisfies KnownHeadwordsResponse),
      );
      return true;
    }

    if (isVocabularyMessage(message)) {
      const fromWordPopup = message.type === 'mine-word' || message.type === 'mark-word-known';
      const fromJapaneseDictionary = message.type === 'mark-word-known' && message.language === 'ja' && fromExtensionPage;
      if (!fromJapaneseDictionary && (fromWordPopup ? !fromWebPage : !fromExtensionPage)) return false;

      void handleVocabularyMessage(message).then(async (response) => {
        if (response.ok && (message.type === 'mark-word-known' || message.type === 'set-vocabulary-status' ||
          message.type === 'delete-vocabulary' || (message.type === 'mine-word' && response.outcome !== 'existing'))) {
          await notifyVocabularyChanged(knownStatusChanges(message), message.language);
        }
        sendResponse(response);
      }).catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Could not access saved vocabulary.',
        });
      });
      return true;
    }

    if (message && typeof message === 'object' && 'type' in message) {
      const { type } = message;
      if (type === 'get-preferences' || type === 'set-interface-theme' || type === 'set-subtitle-appearance') {
        if (!fromExtensionPage && (type !== 'get-preferences' || !fromWebPage)) return false;

        const saveAndRead = async (): Promise<PreferencesResponse> => {
          const stored = await browser.storage.local.get([THEME_KEY, SUBTITLE_APPEARANCE_KEY]);
          let theme: InterfaceTheme = stored[THEME_KEY] === 'light' ? 'light' : 'dark';
          const storedAppearance = stored[SUBTITLE_APPEARANCE_KEY];
          let appearance = isSubtitleAppearance(storedAppearance) ? storedAppearance : DEFAULT_SUBTITLE_APPEARANCE;
          if (type === 'set-interface-theme') {
            const requestedTheme = 'theme' in message ? message.theme : undefined;
            if (requestedTheme !== 'light' && requestedTheme !== 'dark') return { ok: false };
            theme = requestedTheme;
            await browser.storage.local.set({ [THEME_KEY]: theme });
          } else if (type === 'set-subtitle-appearance') {
            const requestedAppearance = 'appearance' in message ? message.appearance : undefined;
            if (!isSubtitleAppearance(requestedAppearance)) return { ok: false };
            const { size, textColor, underlineColor, font } = requestedAppearance;
            appearance = { size, textColor, underlineColor, font };
            await browser.storage.local.set({ [SUBTITLE_APPEARANCE_KEY]: appearance });
          }
          return { ok: true, theme, appearance };
        };
        void saveAndRead().then(sendResponse, () => sendResponse({ ok: false }));
        return true;
      }
    }

    // Only extension pages can access settings, bulk imports and AnkiConnect.
    if (!fromExtensionPage) return false;

    if (message && typeof message === 'object' && 'type' in message) {
      if (message.type === 'get-known-word-history') {
        const language = 'language' in message ? message.language : undefined;
        if (!isOptionalReaderLanguage(language)) {
          sendResponse({ ok: false, error: 'Invalid reading language.' } satisfies HistoryResponse);
          return false;
        }
        void readKnownWordHistory(true, language).then(
          (history) => sendResponse({ ok: true, history } satisfies HistoryResponse),
          () => sendResponse({ ok: false, error: 'Could not access known-word history.' } satisfies HistoryResponse),
        );
        return true;
      }
      if (message.type === 'import-known-headwords') {
        if ('language' in message && message.language !== undefined && message.language !== 'ko') {
          sendResponse({ ok: false, error: 'Japanese known-word imports are still in development.' });
          return false;
        }
        const words = 'headwords' in message ? message.headwords : null;
        if (!isKnownHeadwordList(words)) {
          sendResponse({ ok: false, error: 'Invalid Korean word list.' });
          return false;
        }
        void markHeadwordsKnown(words).then(async (marked) => {
          if (marked) await notifyVocabularyChanged();
          sendResponse({ ok: true, marked });
        }).catch(() => sendResponse({ ok: false, error: 'Could not save known words.' }));
        return true;
      }
    }

    if (isAnkiMessage(message)) {
      void handleAnkiMessage(message).then(async (response) => {
        if (response.ok && response.markedKnown) await notifyVocabularyChanged();
        sendResponse(response);
      }).catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : 'AnkiConnect request failed.' });
      });
      return true;
    }

    if (isGetSettingsMessage(message)) {
      void browser.storage.local
        .get(KRDICT_API_KEY_STORAGE)
        .then((settings) =>
          sendResponse({
            ok: true,
            krDictApiKey:
              typeof settings[KRDICT_API_KEY_STORAGE] === 'string'
                ? settings[KRDICT_API_KEY_STORAGE]
                : '',
          } satisfies SettingsResponse),
        )
        .catch(() => sendResponse({
          ok: false,
          error: 'Could not read dictionary settings.',
        } satisfies SettingsResponse));
      return true;
    }

    if (isSetKrDictApiKeyMessage(message)) {
      void browser.storage.local
        .set({ [KRDICT_API_KEY_STORAGE]: message.apiKey.trim() })
        .then(() => sendResponse({ ok: true } satisfies SettingsResponse))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : 'Could not save the KRDict API key.',
          } satisfies SettingsResponse),
        );
      return true;
    }

    if (isClearDictionaryCacheMessage(message)) {
      void clearDictionaryCache()
        .then(() => sendResponse({ ok: true } satisfies SettingsResponse))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : 'Could not clear the dictionary cache.',
          } satisfies SettingsResponse),
        );
      return true;
    }

    return false;
  });
});
