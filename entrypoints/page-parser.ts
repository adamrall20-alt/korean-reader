import { browser } from 'wxt/browser';
import { observePreferences } from '@/services/storage/preferences';
import { createWebpageParser, TOGGLE_PARSE_PAGE } from '@/services/webpage/parser';
import { createPagePopupHost } from '@/services/webpage/popup-host';
import {
  VOCABULARY_REVISION_KEY,
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
    try {
      const response: KnownHeadwordsResponse | undefined = await browser.runtime.sendMessage({
        type: 'get-known-headwords',
      } satisfies KnownHeadwordsMessage);
      if (response?.ok) {
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
    if (area !== 'local' || !(VOCABULARY_REVISION_KEY in changes)) return;
    const delta = vocabularyRevisionChanges(changes[VOCABULARY_REVISION_KEY]?.newValue);
    if (!delta || !knownLoaded) return void refreshKnownWords();
    for (const headword of delta.known) knownHeadwords.add(headword);
    for (const headword of delta.unknown) knownHeadwords.delete(headword);
    publishKnown();
  });

  browser.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type !== TOGGLE_PARSE_PAGE) return false;
    void (async () => {
      if (parser.isParsed()) {
        parser.clear();
        respond({ ok: true, parsed: false });
        return;
      }
      if (!knownLoaded) await refreshKnownWords();
      const wordCount = await parser.parse();
      respond({ ok: true, parsed: true, wordCount });
    })().catch((error) => {
      respond({ ok: false, error: error instanceof Error ? error.message : 'Could not parse this page.' });
    });
    return true;
  });
});
