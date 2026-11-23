import {
  DEFAULT_SUBTITLE_APPEARANCE, subtitleStyle, type InterfaceTheme, type SubtitleAppearance,
} from '@/types/preferences';
import { createApp, h, reactive, type App } from 'vue';
import subtitleOverlayStyles from '@/assets/subtitle-overlay.css?inline';
import SubtitleReader from '@/components/SubtitleReader.vue';
import type { TokenizedSubtitleLine } from '@/types/messages';
import type { VocabularyContext } from '@/types/vocabulary';
import { captureSubtitleAudio } from '@/services/youtube/audio';
import { getYouTubeVideoId, matchesCaptionLanguage } from '@/services/youtube/captions';
import type { CaptionAudioTiming, CaptionSnapshot } from '@/types/youtube';

export const SUBTITLE_OVERLAY_HOST_ID = 'korean-reader-subtitle-overlay';

export interface SubtitleOverlay {
  update(
    snapshot: CaptionSnapshot,
    player: HTMLElement | null,
    lines?: TokenizedSubtitleLine[] | null,
  ): void;
  setKnownHeadwords(headwords: Iterable<string>): void;
  setTheme(theme: InterfaceTheme): void;
  setAppearance(appearance: SubtitleAppearance): void;
  hide(): void;
  destroy(): void;
}

export function createSubtitleOverlay(doc: Document = document): SubtitleOverlay & {
  resetLanguage(): void;
  prepareCueAudio(video: HTMLVideoElement, videoId: string, timing: CaptionAudioTiming, selectedAt: number): () => Promise<string | undefined>;
} {
  const state = reactive<{
    lines: TokenizedSubtitleLine[];
    visible: boolean;
    appearance: SubtitleAppearance;
    theme: InterfaceTheme;
    knownHeadwords: Set<string>;
    snapshot?: CaptionSnapshot;
    source?: Omit<VocabularyContext, 'originalForm'>;
  }>({
    lines: [],
    knownHeadwords: new Set(),
    visible: false,
    appearance: DEFAULT_SUBTITLE_APPEARANCE,
    theme: 'dark',
  });

  let host: HTMLDivElement | null = null;
  let app: App<Element> | null = null;

  let recording: { videoId: string; controller: AbortController } | undefined;
  const recordingHere = () => recording?.videoId === getYouTubeVideoId(doc.location.href);

  function prepareAudio(video: HTMLVideoElement, selectedAt: number) {
    const { audioTiming, videoId } = state.snapshot ?? {};
    if (audioTiming && videoId) return prepareCueAudio(video, videoId, audioTiming, selectedAt);
  }

  function prepareCueAudio(video: HTMLVideoElement, videoId: string, audioTiming: CaptionAudioTiming, selectedAt: number) {
    return async () => {
      if (recording) return undefined;
      const controller = new AbortController();
      recording = { videoId, controller };
      try {
        return await captureSubtitleAudio(video, videoId, audioTiming, selectedAt, controller.signal);
      } finally {
        recording = undefined;
      }
    };
  }

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
    shadow.append(point);

    app = createApp({
      setup() {
        return () => h(SubtitleReader, {
          language: state.snapshot?.readingLanguage,
          lines: state.lines,
          visible: state.visible,
          source: state.source,
          prepareAudio,
          knownHeadwords: state.knownHeadwords,
          appearance: state.appearance,
          'data-theme': state.theme,
          style: subtitleStyle(state.appearance, state.snapshot?.readingLanguage),
        });
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
    if (recordingHere()) return;
    recording?.controller.abort();
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
    if (recording?.videoId === snapshot.videoId && state.snapshot?.readingLanguage === snapshot.readingLanguage) return;
    recording?.controller.abort();
    if (!player) {
      hide();
      return;
    }

    ensureMounted(player);

    state.snapshot = snapshot;
    state.source = snapshot.videoId ? {
      sentence: snapshot.text,
      sourceUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(snapshot.videoId)}`,
      sourceTitle: doc.title.replace(/ - YouTube$/, ''),
      timestamp: snapshot.timestamp ?? undefined,
    } : undefined;
    state.lines = lines ?? [];
    state.visible = matchesCaptionLanguage(snapshot) && state.lines.length > 0;

    if (host) {
      host.dataset.timestamp = snapshot.timestamp === null ? '' : snapshot.timestamp.toFixed(3);
      host.dataset.videoId = snapshot.videoId ?? '';
    }
  }

  function destroy(): void {
    recording?.controller.abort();
    app?.unmount();
    app = null;
    host?.remove();
    host = null;
    state.lines = [];
    state.visible = false;
  }

  return {
    update,
    prepareCueAudio,
    resetLanguage() {
      recording?.controller.abort();
      state.visible = false;
      state.lines = [];
    },
    setKnownHeadwords(headwords) {
      state.knownHeadwords = new Set(headwords);
    },
    setTheme(theme) {
      state.theme = theme;
    },
    setAppearance(appearance) {
      state.appearance = appearance;
    },
    hide,
    destroy,
  };
}
