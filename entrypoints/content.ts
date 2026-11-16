import { createCaptionMonitor } from '@/services/youtube/captions';
import { createSubtitleOverlay } from '@/services/youtube/overlay';
import { createSubtitlePresenter } from '@/services/youtube/presenter';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',
  main() {
    console.info('[Korean Reader] Content script ready on YouTube.');
    document.documentElement.dataset.koreanReader = 'ready';

    const overlay = createSubtitleOverlay(document);
    const presenter = createSubtitlePresenter({ document, overlay });
    const monitor = createCaptionMonitor({
      document,
      onUpdate: (snapshot) => presenter.update(snapshot),
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
