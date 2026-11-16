import { createApp, h, reactive, type App } from 'vue';
import subtitleOverlayStyles from '@/assets/subtitle-overlay.css?inline';
import SubtitleReader from '@/components/SubtitleReader.vue';
import type { TokenizedSubtitleLine } from '@/types/messages';
import type { VocabularyContext } from '@/types/vocabulary';
import type { CaptionSnapshot } from '@/types/youtube';

export const SUBTITLE_OVERLAY_HOST_ID = 'korean-reader-subtitle-overlay';

export interface SubtitleOverlay {
  update(
    snapshot: CaptionSnapshot,
    player: HTMLElement | null,
    lines?: TokenizedSubtitleLine[] | null,
  ): void;
  hide(): void;
  destroy(): void;
}

export function createSubtitleOverlay(doc: Document = document): SubtitleOverlay {
  const state = reactive<{
    lines: TokenizedSubtitleLine[];
    visible: boolean;
    source?: Omit<VocabularyContext, 'originalForm'>;
  }>({
    lines: [],
    visible: false,
  });

  let host: HTMLDivElement | null = null;
  let app: App<Element> | null = null;
  let mountPoint: HTMLDivElement | null = null;

  function build(): void {
    host = doc.createElement('div');
    host.id = SUBTITLE_OVERLAY_HOST_ID;
    host.dataset.koreanReader = 'subtitle-overlay';
    host.style.position = 'absolute';
    host.style.right = '0';
    host.style.bottom = '10%';
    host.style.left = '0';
    host.style.zIndex = '60';
    host.style.display = 'flex';
    host.style.justifyContent = 'center';
    host.style.pointerEvents = 'none';

    const shadow = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = subtitleOverlayStyles;
    shadow.append(style);

    const point = doc.createElement('div');
    mountPoint = point;
    shadow.append(point);

    app = createApp({
      setup() {
        return () => h(SubtitleReader, { lines: state.lines, visible: state.visible, source: state.source });
      },
    });
    app.mount(point);
  }

  function ensureMounted(player: HTMLElement | null): void {
    if (!player) {
      return;
    }

    if (!host || !app) {
      build();
    }

    if (host && host.parentElement !== player) {
      player.append(host);
    }
  }

  function hide(): void {
    if (state.visible) {
      state.visible = false;
    }

    if (state.lines.length > 0) {
      state.lines = [];
    }

    if (host) {
      host.dataset.timestamp = '';
    }
  }

  function update(
    snapshot: CaptionSnapshot,
    player: HTMLElement | null,
    lines: TokenizedSubtitleLine[] | null = null,
  ): void {
    if (!player) {
      hide();
      return;
    }

    ensureMounted(player);

    state.source = snapshot.videoId ? {
      sentence: snapshot.text,
      sourceUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(snapshot.videoId)}`,
      sourceTitle: doc.title.replace(/ - YouTube$/, ''),
      timestamp: snapshot.timestamp ?? undefined,
    } : undefined;
    state.lines = lines ?? [];
    state.visible = snapshot.isKorean && state.lines.length > 0;

    if (host) {
      host.dataset.timestamp = snapshot.timestamp === null ? '' : snapshot.timestamp.toFixed(3);
      host.dataset.videoId = snapshot.videoId ?? '';
    }
  }

  function destroy(): void {
    app?.unmount();
    app = null;
    host?.remove();
    host = null;
    mountPoint = null;
    state.lines = [];
    state.visible = false;
  }

  return {
    update,
    hide,
    destroy,
  };
}
