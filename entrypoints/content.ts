import { observePreferences } from '@/services/storage/preferences';
import { createTranscriptSidebar } from '@/services/youtube/sidebar';
import { OPEN_TRANSCRIPT } from '@/services/youtube/transcript';
import { createCaptionMonitor } from '@/services/youtube/captions';
import { createSubtitleOverlay } from '@/services/youtube/overlay';
import { createSubtitlePresenter } from '@/services/youtube/presenter';
import type { CaptionSnapshot } from '@/types/youtube';
import type { TokenizeResponse } from '@/types/messages';
import {
  VOCABULARY_REVISION_KEY, vocabularyRevisionChanges, type KnownHeadwordsMessage, type KnownHeadwordsResponse,
} from '@/types/vocabulary';
import { browser } from 'wxt/browser';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',
  main() {
    console.info('[Korean Reader] Content script ready on YouTube.');
    document.documentElement.dataset.koreanReader = 'ready';

    const overlay = createSubtitleOverlay(document);
    const sidebar = createTranscriptSidebar(overlay.prepareCueAudio);
    const stopPreferences = observePreferences((theme) => {
      overlay.setTheme(theme);
      sidebar.setTheme(theme);
    }, (appearance) => {
      overlay.setAppearance(appearance);
      sidebar.setAppearance(appearance);
    });
    const onMessage: Parameters<typeof browser.runtime.onMessage.addListener>[0] = (message, _sender, respond) => {
      if (message?.type === OPEN_TRANSCRIPT) respond({ ok: sidebar.open() });
    };
    browser.runtime.onMessage.addListener(onMessage);
    const presenter = createSubtitlePresenter({ document, overlay });
    let knownHeadwords = new Set<string>();
    let knownLoaded = false;
    let vocabularyGeneration = 0;
    let settledGeneration = 0;
    const publishKnownWords = () => {
      overlay.setKnownHeadwords(knownHeadwords);
      sidebar.setKnownHeadwords(knownHeadwords);
    };
    const refreshKnownWords = async () => {
      const generation = ++vocabularyGeneration;
      try {
        const response: KnownHeadwordsResponse | undefined = await browser.runtime.sendMessage({
          type: 'get-known-headwords',
        } satisfies KnownHeadwordsMessage);
        if (generation === vocabularyGeneration && response?.ok) {
          knownHeadwords = new Set(response.headwords);
          knownLoaded = true;
          publishKnownWords();
        }
      } catch {
        // Captions remain usable if the background is temporarily unavailable.
      } finally {
        if (generation === vocabularyGeneration) settledGeneration = generation;
      }
    };
    const onStorageChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
      if (area !== 'local' || !(VOCABULARY_REVISION_KEY in changes)) return;
      const delta = vocabularyRevisionChanges(changes[VOCABULARY_REVISION_KEY]?.newValue);
      if (!delta || !knownLoaded) return void refreshKnownWords();

      // Patch the cached set instead of re-fetching every known headword for a single-word change.
      for (const headword of delta.known) knownHeadwords.add(headword);
      for (const headword of delta.unknown) knownHeadwords.delete(headword);
      publishKnownWords();
      // A full load already in flight may have read storage before this change; replace it.
      if (settledGeneration !== vocabularyGeneration) void refreshKnownWords();
    };
    browser.storage.onChanged.addListener(onStorageChanged);
    void refreshKnownWords();

    let generation = 0;
    let videoId: string | null = null;
    let pending: CaptionSnapshot | undefined;
    let analysing = false;

    const analyse = async () => {
      if (analysing) return;
      analysing = true;
      try {
        while (pending) {
          const snapshot = pending;
          pending = undefined;
          const requestGeneration = generation;
          try {
            const response = await browser.runtime.sendMessage({
              type: 'tokenize', lines: snapshot.lines,
            }) as TokenizeResponse | undefined;
            if (requestGeneration !== generation || (pending && !snapshot.isRolling)) continue;
            if (response?.ok && response.lines?.length === snapshot.lines.length) {
              presenter.update(snapshot, response.lines);
            } else {
              presenter.update(snapshot);
            }
          } catch (error) {
            if (requestGeneration === generation) presenter.update(snapshot);
            console.error('[Korean Reader] Korean subtitle analysis failed.', error);
          }
        }
      } finally {
        analysing = false;
      }
    };

    const monitor = createCaptionMonitor({
      document,
      onUpdate: (snapshot) => {
        sidebar.update(snapshot);
        const valid = snapshot.videoId && snapshot.hasVideo && snapshot.isKorean && snapshot.lines.length;
        if (!valid || videoId !== snapshot.videoId) {
          videoId = snapshot.videoId;
          generation += 1;
          pending = undefined;
          presenter.update(snapshot);
        }
        if (!valid) return;
        pending = snapshot;
        void analyse();
      },
    });

    const refresh = () => {
      sidebar.refresh();
      monitor.refresh();
    };

    const handlePageHide = () => {
      document.removeEventListener('yt-navigate-finish', refresh);
      document.removeEventListener('yt-page-data-updated', refresh);
      document.removeEventListener('visibilitychange', refresh);
      browser.storage.onChanged.removeListener(onStorageChanged);
      browser.runtime.onMessage.removeListener(onMessage);
      sidebar.destroy();
      stopPreferences();
      vocabularyGeneration += 1;
      pending = undefined;
      generation += 1;
      monitor.stop();
      presenter.destroy();
    };

    document.addEventListener('yt-navigate-finish', refresh);
    document.addEventListener('yt-page-data-updated', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pagehide', handlePageHide, { once: true });

    monitor.start();
  },
});
