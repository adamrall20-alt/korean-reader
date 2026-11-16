import { browser } from 'wxt/browser';
import { lookupKoreanWord } from '@/services/dictionary/krdict';
import { clearDictionaryCache } from '@/services/dictionary/cache';
import { tokenizeSubtitleLines } from '@/services/korean/kiwi';
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
    Array.isArray((message as { morphemes?: unknown }).morphemes)
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

  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
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

        try {
          const entry = await lookupKoreanWord(message.word, message.morphemes, apiKey);
          sendResponse({ ok: true, entry } satisfies LookupResponse);
        } catch (error: unknown) {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : 'Dictionary lookup failed.',
          } satisfies LookupResponse);
        }
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
        );
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
