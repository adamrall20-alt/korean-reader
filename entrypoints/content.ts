import { createCaptionMonitor } from '@/services/youtube/captions';
import { createSubtitleOverlay } from '@/services/youtube/overlay';
import { createSubtitlePresenter } from '@/services/youtube/presenter';
import type { TokenizeResponse } from '@/types/messages';
import { browser } from 'wxt/browser';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',
  main() {
    console.info('[Korean Reader] Content script ready on YouTube.');
    document.documentElement.dataset.koreanReader = 'ready';

    const overlay = createSubtitleOverlay(document);
    const presenter = createSubtitlePresenter({ document, overlay });
    let updateGeneration = 0;
    const monitor = createCaptionMonitor({
      document,
      onUpdate: (snapshot) => {
        const generation = ++updateGeneration;
        presenter.update(snapshot);

        if (!snapshot.isKorean || snapshot.lines.length === 0) {
          return;
        }

        void browser.runtime
          .sendMessage({ type: 'tokenize', lines: snapshot.lines })
          .then((response: TokenizeResponse | undefined) => {
            if (
              generation !== updateGeneration ||
              !response?.ok ||
              !response.lines ||
              response.lines.length !== snapshot.lines.length
            ) {
              return;
            }

            presenter.update(snapshot, response.lines);
          })
          .catch((error: unknown) => {
            console.error('[Korean Reader] Korean subtitle analysis failed.', error);
          });
      },
    });

    const refresh = () => monitor.refresh();

    const handlePageHide = () => {
      document.removeEventListener('yt-navigate-finish', refresh);
      document.removeEventListener('yt-page-data-updated', refresh);
      document.removeEventListener('visibilitychange', refresh);
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
