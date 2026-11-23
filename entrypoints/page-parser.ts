import { READING_LANGUAGE_CHANGED, readingLanguage, type ReaderLanguage } from '@/types/language';
import { browser } from 'wxt/browser';
import { observePreferences } from '@/services/storage/preferences';
import { createWebpageParser, TOGGLE_PARSE_PAGE } from '@/services/webpage/parser';
import { createPagePopupHost } from '@/services/webpage/popup-host';
import {
  vocabularyRevisionKey,
  vocabularyRevisionChanges,
  type KnownHeadwordsMessage,
  type KnownHeadwordsResponse,
} from '@/types/vocabulary';

declare global {
  interface Window {
    __koreanReaderPageParserReady?: boolean;
  }
}

export default defineUnlistedScript(() => {
  if (window.__koreanReaderPageParserReady) return;
  window.__koreanReaderPageParserReady = true;

  let knownHeadwords = new Set<string>();
  let knownLoaded = false;
  let language: ReaderLanguage = 'ko';
  let generation = 0;

  const popup = createPagePopupHost(document, () => parser.clearSelected());
  const parser = createWebpageParser({
    document,
    onSelectWord: (selection) => {
      void popup.openForWord(selection);
    },
    onClearSelection: () => {
      popup.close();
    },
  });

  const publishKnown = () => {
    parser.setKnownHeadwords(knownHeadwords);
    popup.setKnownHeadwords(knownHeadwords);
  };

  const refreshKnownWords = async () => {
    const current = ++generation;
    try {
      const response: KnownHeadwordsResponse | undefined = await browser.runtime.sendMessage({
        type: 'get-known-headwords', ...(language === 'ja' ? { language } : {}),
      } satisfies KnownHeadwordsMessage);
      if (current === generation && response?.ok) {
        knownHeadwords = new Set(response.headwords);
        knownLoaded = true;
        publishKnown();
      }
    } catch {
      // Page parsing remains usable if background is temporarily unavailable.
    }
  };

  observePreferences(
    (theme) => popup.setTheme(theme),
    (appearance) => parser.setUnderlineColor(appearance.underlineColor),
  );

  browser.storage.onChanged.addListener((changes, area) => {
    const key = vocabularyRevisionKey(language);
    if (area !== 'local' || !(key in changes)) return;
    const delta = vocabularyRevisionChanges(changes[key]?.newValue);
    if (!delta || !knownLoaded) return void refreshKnownWords();
    for (const headword of delta.known) knownHeadwords.add(headword);
    for (const headword of delta.unknown) knownHeadwords.delete(headword);
    publishKnown();
  });

  browser.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type !== TOGGLE_PARSE_PAGE && message?.type !== READING_LANGUAGE_CHANGED) return false;
    const next = readingLanguage(message.language);
    if (next !== language) {
      generation += 1;
      parser.clear();
      language = next;
      knownLoaded = false;
      knownHeadwords = new Set();
      publishKnown();
    }
    if (message.type === READING_LANGUAGE_CHANGED) return false;
    void (async () => {
      if (parser.isParsed()) {
        parser.clear();
        respond({ ok: true, parsed: false });
        return;
      }
      if (!knownLoaded) await refreshKnownWords();
      if (next !== language) return respond({ ok: true, parsed: false });
      const wordCount = await parser.parse(next);
      respond({ ok: true, parsed: true, wordCount });
    })().catch((error) => {
      if (next === language) parser.clear();
      respond({ ok: false, error: error instanceof Error ? error.message : 'Could not parse this page.' });
    });
    return true;
  });
});
