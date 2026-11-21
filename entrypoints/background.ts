import { handleAccountMessage } from '@/services/account/messages';
import { accountEnabled, isAccountMessage } from '@/types/account';
import {
  DEFAULT_SUBTITLE_APPEARANCE, isSubtitleAppearance, SUBTITLE_APPEARANCE_KEY, THEME_KEY,
  type InterfaceTheme, type PreferencesResponse,
} from '@/types/preferences';
import { browser } from 'wxt/browser';
import { handleAnkiMessage, isAnkiMessage } from '@/services/anki/messages';
import { frequencyRank } from '@/services/dictionary/frequency';
import { lookupKoreanWord } from '@/services/dictionary/krdict';
import { clearDictionaryCache } from '@/services/dictionary/cache';
import {
  VOCABULARY_REVISION_KEY, type KnownHeadwordsResponse, type VocabularyMessage, type VocabularyRevision,
} from '@/types/vocabulary';
import { readKnownWordHistory } from '@/services/storage/statistics';
import type { HistoryResponse } from '@/types/statistics';
import { getVocabulary, listKnownHeadwords, listVocabulary, normalizeHeadword } from '@/services/storage/vocabulary';
import { pushEntriesToDesktop, syncMissingEntriesToDesktop } from '@/services/desktop/bridge';
import { handleVocabularyMessage, isVocabularyMessage } from '@/services/storage/vocabulary-messages';
import { tokenizeSubtitleLines } from '@/services/korean/kiwi';
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
let desktopCatchUpComplete = false;
let desktopCatchUpInFlight: Promise<void> | null = null;

async function runDesktopCatchUp(): Promise<void> {
  if (desktopCatchUpComplete) return;
  if (desktopCatchUpInFlight) return desktopCatchUpInFlight;
  desktopCatchUpInFlight = (async () => {
    try {
      const entries = await listVocabulary();
      const result = await syncMissingEntriesToDesktop(entries);
      if (result.reachable) {
        desktopCatchUpComplete = true;
      }
    } catch {
      // Desktop app is optional; ignore when offline or storage is unavailable.
    } finally {
      desktopCatchUpInFlight = null;
    }
  })();
  return desktopCatchUpInFlight;
}

async function autoSyncDesktopAfterMine(headword: string): Promise<void> {
  try {
    const entry = await getVocabulary(headword);
    if (entry && entry.contexts.length > 0) {
      const pushed = await pushEntriesToDesktop([entry]);
      if (pushed && !desktopCatchUpComplete) {
        await runDesktopCatchUp();
      }
    }
  } catch {
    // Desktop app is optional; never disrupt mining.
  }
}

/** Without changes, YouTube tabs reload every known headword; with changes, they patch their cached set. */
async function notifyVocabularyChanged(changes?: { known: string[]; unknown: string[] }) {
  const revision: VocabularyRevision = { id: crypto.randomUUID(), ...changes };
  await browser.storage.local.set({ [VOCABULARY_REVISION_KEY]: revision }).catch((error) => {
    console.warn('[Korean Reader] Could not notify subtitle tabs of vocabulary changes.', error);
  });
}

function knownStatusChanges(message: VocabularyMessage): { known: string[]; unknown: string[] } | undefined {
  switch (message.type) {
    case 'mine-word': return { known: [normalizeHeadword(message.entry.headword)], unknown: [] };
    case 'mark-word-known': return { known: [normalizeHeadword(message.headword)], unknown: [] };
    case 'delete-vocabulary': return { known: [], unknown: [normalizeHeadword(message.headword)] };
    case 'set-vocabulary-status': {
      const headword = normalizeHeadword(message.headword);
      return message.status === 'known' ? { known: [headword], unknown: [] } : { known: [], unknown: [headword] };
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
    Array.isArray((message as { lines?: unknown }).lines) &&
    (message as { lines: unknown[] }).lines.every((line) => typeof line === 'string')
  );
}

function isLookupMessage(message: unknown): message is LookupMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'lookup' &&
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
  void runDesktopCatchUp();

  browser.runtime.onInstalled.addListener((details) => {
    console.info(`[Korean Reader] Extension ${details.reason}.`);
  });

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (accountEnabled && isAccountMessage(message) && sender.url === browser.runtime.getURL('/statistics.html')) {
      void handleAccountMessage(message).then(
        (view) => sendResponse({ ok: true, view }),
        (error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Account request failed.' }),
      );
      return true;
    }

    if (isPingMessage(message)) {
      const response: PingResponse = {
        ok: true,
        version: browser.runtime.getManifest().version,
      };
      sendResponse(response);
      return false;
    }

    if (isTokenizeMessage(message)) {
      void tokenizeSubtitleLines(message.lines).then(
        (lines) => sendResponse({ ok: true, lines } satisfies TokenizeResponse),
        (error: unknown) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : 'Korean analysis failed.',
          } satisfies TokenizeResponse),
      );
      return true;
    }

    if (isLookupMessage(message)) {
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

    if (fromWebPage && typeof message === 'object' && message !== null &&
      'type' in message && message.type === 'get-known-headwords') {
      void listKnownHeadwords().then(
        (headwords) => sendResponse({ ok: true, headwords } satisfies KnownHeadwordsResponse),
        () => sendResponse({ ok: false } satisfies KnownHeadwordsResponse),
      );
      return true;
    }

    if (isVocabularyMessage(message)) {
      const fromWordPopup = message.type === 'mine-word' || message.type === 'mark-word-known';
      if (fromWordPopup ? !fromWebPage : !fromExtensionPage) return false;

      void handleVocabularyMessage(message).then(async (response) => {
        if (response.ok && (message.type === 'mark-word-known' || message.type === 'set-vocabulary-status' ||
          message.type === 'delete-vocabulary' || (message.type === 'mine-word' && response.outcome !== 'existing'))) {
          await notifyVocabularyChanged(knownStatusChanges(message));
        }
        if (response.ok && message.type === 'mine-word') {
          void autoSyncDesktopAfterMine(message.entry.headword);
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

    // Only extension pages can read or change dictionary settings.
    if (!fromExtensionPage) return false;

    if (message && typeof message === 'object' && 'type' in message &&
      (message.type === 'get-known-word-history' || message.type === 'start-known-word-tracking')) {
      void readKnownWordHistory(message.type === 'start-known-word-tracking').then(
        (history) => sendResponse({ ok: true, history } satisfies HistoryResponse),
        () => sendResponse({ ok: false, error: 'Could not access known-word history.' } satisfies HistoryResponse),
      );
      return true;
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
