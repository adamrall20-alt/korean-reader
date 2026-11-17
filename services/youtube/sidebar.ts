import { createApp, h, shallowReactive, type App } from 'vue';
import TranscriptSidebar from '@/components/TranscriptSidebar.vue';
import sharedStyles from '@/assets/subtitle-overlay.css?inline';
import sidebarStyles from '@/assets/transcript-sidebar.css?inline';
import { DEFAULT_SUBTITLE_APPEARANCE, type InterfaceTheme, type SubtitleAppearance } from '@/types/preferences';
import { findPlayer, findVideo, getYouTubeVideoId, hasKorean, isKoreanTrack } from './captions';
import {
  activeTranscriptCue, collectTranscriptCue, finishTranscript, TRANSCRIPT_REQUEST, TRANSCRIPT_RESPONSE,
  transcriptCue, type TranscriptCue,
} from './transcript';
import type { CaptionSnapshot } from '@/types/youtube';
import type { createSubtitleOverlay } from './overlay';

export function createTranscriptSidebar(prepareAudio: ReturnType<typeof createSubtitleOverlay>['prepareCueAudio']) {
  const state = shallowReactive({
    videoId: '',
    status: 'loading' as 'loading' | 'full' | 'collecting',
    cues: [] as readonly TranscriptCue[],
    active: undefined as TranscriptCue | undefined,
    theme: 'dark' as InterfaceTheme,
    appearance: DEFAULT_SUBTITLE_APPEARANCE,
    knownHeadwords: new Set<string>(),
    follow: true,
    width: 360,
  });

  let opened = false;
  let requested = false;
  let requestId = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let host: HTMLElement | undefined;
  let app: App | undefined;
  let dockColumn: HTMLElement | undefined;
  let pageStyle: HTMLStyleElement | undefined;
  let layoutObserver: MutationObserver | undefined;
  let video: HTMLVideoElement | null = null;
  let lastSnapshot: CaptionSnapshot | undefined;
  let collected: readonly TranscriptCue[] = [];
  let liveCue: TranscriptCue | undefined;

  function syncPlayback() {
    if (!video || video.seeking || findPlayer(document)?.classList.contains('ad-showing')) {
      state.active = undefined;
      return;
    }
    state.active = state.status === 'full'
      ? activeTranscriptCue(state.cues, video.currentTime)
      : liveCue && video.currentTime + 0.25 >= liveCue.start ? liveCue : undefined;
  }

  function unbindVideo() {
    for (const event of ['timeupdate', 'seeking', 'seeked', 'emptied']) video?.removeEventListener(event, syncPlayback);
    video = null;
  }

  function bindVideo() {
    const current = findVideo(document);
    if (current === video) return;
    unbindVideo();
    video = current;
    for (const event of ['timeupdate', 'seeking', 'seeked', 'emptied']) video?.addEventListener(event, syncPlayback);
  }

  function finish(cues: TranscriptCue[]) {
    clearTimeout(timer);
    state.status = cues.length ? 'full' : 'collecting';
    state.cues = cues.length ? cues : collected;
    if (cues.length) {
      collected = [];
      liveCue = undefined;
    }
    syncPlayback();
  }

  function fetchTranscript() {
    requested = true;
    const id = ++requestId;
    // Browser-supplied text tracks, when populated, already contain timed cues.
    for (const track of Array.from(video?.textTracks ?? [])) {
      if (!isKoreanTrack(track)) continue;
      const cues = finishTranscript(Array.from(track.cues ?? []).flatMap((cue) =>
        transcriptCue(cue.startTime, cue.endTime, 'text' in cue ? String(cue.text) : '') ?? [],
      ));
      if (cues.length) {
        finish(cues);
        return;
      }
    }
    state.status = 'loading';
    timer = setTimeout(() => {
      if (id === requestId && state.status === 'loading') finish([]);
    }, 6500);
    document.dispatchEvent(new CustomEvent(TRANSCRIPT_REQUEST, { detail: { videoId: state.videoId, requestId: id } }));
  }

  function receive(event: Event) {
    const detail = (event as CustomEvent).detail;
    if (state.status !== 'loading' || !requested || detail?.videoId !== state.videoId ||
        detail?.requestId !== requestId || !Array.isArray(detail.cues)) return;
    finish(finishTranscript(detail.cues.flatMap((cue: Partial<TranscriptCue> | null) =>
      cue && typeof cue.text === 'string' ? transcriptCue(cue.start, cue.end, cue.text) ?? [] : [],
    )));
  }

  function applyWidth(width: number) {
    const max = Math.min(620, host?.dataset.layout === 'overlay' ? window.innerWidth - 24 : window.innerWidth * 0.42);
    state.width = Math.round(Math.min(Math.max(240, width), max));
    if (host) host.style.width = state.width + 'px';
    dockColumn?.style.setProperty('--kr-transcript-column', state.width + 'px');
  }

  function layout() {
    const watch = document.querySelector('ytd-watch-flexy');
    const secondary = watch?.querySelector<HTMLElement>('#secondary');
    const dock = secondary && !watch?.hasAttribute('theater') && secondary.getBoundingClientRect().width > 0 &&
      window.innerWidth >= 1000;
    if (!host) return;
    if (dockColumn !== (dock ? secondary : undefined)) {
      dockColumn?.style.removeProperty('--kr-transcript-column');
      dockColumn = dock ? secondary : undefined;
    }
    host.dataset.layout = dock ? 'docked' : 'overlay';
    host.hidden = !!document.fullscreenElement || !!watch?.hasAttribute('fullscreen');
    const target = dock ? secondary.querySelector('#secondary-inner') ?? secondary : document.body;
    if (host.parentElement !== target) target.prepend(host);
    applyWidth(state.width);
  }

  function hide() {
    opened = false;
    app?.unmount();
    app = undefined;
    host?.remove();
    host = undefined;
    dockColumn?.style.removeProperty('--kr-transcript-column');
    dockColumn = undefined;
    pageStyle?.remove();
    layoutObserver?.disconnect();
    window.removeEventListener('resize', layout);
    document.removeEventListener('fullscreenchange', layout);
  }

  function changeVideo(id: string) {
    if (id === state.videoId) return;
    clearTimeout(timer);
    state.videoId = id;
    state.active = undefined;
    state.cues = [];
    state.status = 'loading';
    collected = [];
    liveCue = undefined;
    requested = false;
    unbindVideo();
    if (!id) hide();
  }

  function refresh() {
    const id = location.pathname === '/watch' ? getYouTubeVideoId(location.href) ?? '' : '';
    changeVideo(id);
    if (!opened) return;
    layout();
    bindVideo();
    if (video && !requested) fetchTranscript();
  }

  function open() {
    if (location.pathname !== '/watch' || !getYouTubeVideoId(location.href)) return false;
    if (opened) return true;
    opened = true;
    host = document.createElement('div');
    host.id = 'korean-reader-transcript';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = sharedStyles + sidebarStyles;
    const point = document.createElement('div');
    pageStyle = document.createElement('style');
    pageStyle.textContent = `
      ytd-watch-flexy #secondary:has(#korean-reader-transcript[data-layout="docked"]:not([hidden])) {
        width: var(--kr-transcript-column) !important;
        min-width: var(--kr-transcript-column) !important;
      }
    `;
    document.head.append(pageStyle);
    shadow.append(style, point);
    refresh();
    const watch = document.querySelector('ytd-watch-flexy');
    if (watch) {
      layoutObserver = new MutationObserver(layout);
      layoutObserver.observe(watch, { attributes: true, attributeFilter: ['theater', 'fullscreen'] });
    }
    window.addEventListener('resize', layout);
    document.addEventListener('fullscreenchange', layout);
    app = createApp({
      render: () => h(TranscriptSidebar, {
        key: state.videoId,
        ...state,
        prepareAudio,
        onClose: hide,
        onResize: applyWidth,
        onFollow: (follow: boolean) => { state.follow = follow; },
      }),
    });
    app.mount(point);
    if (lastSnapshot) update(lastSnapshot);
    return true;
  }

  function update(snapshot: CaptionSnapshot) {
    lastSnapshot = snapshot;
    if (!opened && !requested) return;
    refresh();
    if (!requested || state.status === 'full' || snapshot.videoId !== state.videoId) return;
    if (findPlayer(document)?.classList.contains('ad-showing')) {
      liveCue = undefined;
    } else if (hasKorean(snapshot.text) && snapshot.timestamp !== null) {
      const start = snapshot.audioTiming?.start ?? snapshot.timestamp;
      const cue = { start, end: snapshot.audioTiming?.end, text: snapshot.text, observedAt: snapshot.timestamp };
      const result = collectTranscriptCue(collected, cue);
      liveCue = result.selected;
      collected = result.cues;
      state.cues = collected;
    } else {
      liveCue = undefined;
    }
    syncPlayback();
  }

  document.addEventListener(TRANSCRIPT_RESPONSE, receive);

  return {
    open,
    refresh,
    update,
    setKnownHeadwords(headwords: string[]) { state.knownHeadwords = new Set(headwords); },
    setTheme(theme: InterfaceTheme) { state.theme = theme; },
    setAppearance(appearance: SubtitleAppearance) { state.appearance = appearance; },
    destroy() {
      hide();
      unbindVideo();
      clearTimeout(timer);
      document.removeEventListener(TRANSCRIPT_RESPONSE, receive);
    },
  };
}
