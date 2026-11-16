import { createCaptionMonitor } from '@/services/youtube/captions';
import { createSubtitleOverlay } from '@/services/youtube/overlay';
import { createSubtitlePresenter } from '@/services/youtube/presenter';
import type { CaptionSnapshot } from '@/types/youtube';
import type { TokenizeResponse } from '@/types/messages';
import { VOCABULARY_REVISION_KEY, type KnownHeadwordsMessage, type KnownHeadwordsResponse } from '@/types/vocabulary';
import { browser } from 'wxt/browser';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',
  main() {
    console.info('[Korean Reader] Content script ready on YouTube.');
    document.documentElement.dataset.koreanReader = 'ready';

    const overlay = createSubtitleOverlay(document);
    const presenter = createSubtitlePresenter({ document, overlay });
    let vocabularyGeneration = 0;
    const refreshKnownWords = async () => {
      const generation = ++vocabularyGeneration;
      try {
        const response: KnownHeadwordsResponse | undefined = await browser.runtime.sendMessage({
          type: 'get-known-headwords',
        } satisfies KnownHeadwordsMessage);
        if (generation === vocabularyGeneration && response?.ok) {
          overlay.setKnownHeadwords(response.headwords);
        }
      } catch {
        // Captions remain usable if the background is temporarily unavailable.
      }
    };
    const onStorageChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
      if (area === 'local' && VOCABULARY_REVISION_KEY in changes) void refreshKnownWords();
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

    const refresh = () => monitor.refresh();

    const handlePageHide = () => {
      document.removeEventListener('yt-navigate-finish', refresh);
      document.removeEventListener('yt-page-data-updated', refresh);
      document.removeEventListener('visibilitychange', refresh);
      browser.storage.onChanged.removeListener(onStorageChanged);
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
