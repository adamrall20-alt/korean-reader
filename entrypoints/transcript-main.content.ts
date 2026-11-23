import { finishTranscript, TRANSCRIPT_REQUEST, TRANSCRIPT_RESPONSE, transcriptCue, type TranscriptCue } from '@/services/youtube/transcript';

import { CAPTION_TRACK_REQUEST, CAPTION_TRACK_RESPONSE } from '@/services/youtube/captions';
import { readingLanguage, type ReaderLanguage } from '@/types/language';

interface CaptionTrack {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
}

interface PlayerResponse {
  videoDetails?: { videoId?: string; isLive?: boolean };
  captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
}

interface YouTubeContext {
  client?: { hl?: string };
}

interface YouTubeWatch extends HTMLElement {
  data?: { playerResponse?: PlayerResponse; response?: unknown };
}

function* valuesFor(value: unknown, key: string): Generator<unknown> {
  if (!value || typeof value !== 'object') return;
  for (const [name, child] of Object.entries(value)) {
    if (name === key) yield child;
    else yield* valuesFor(child, key);
  }
}

function transcriptParams(response: unknown): string | undefined {
  for (const value of valuesFor(response, 'getTranscriptEndpoint')) {
    const params = (value as { params?: unknown } | null)?.params;
    if (typeof params === 'string') return params;
  }
}

function parseSegments(data: unknown, language: ReaderLanguage, trusted = false): TranscriptCue[] {
  const cues: TranscriptCue[] = [];
  for (const value of valuesFor(data, 'transcriptSegmentRenderer')) {
    const segment = value as { startMs?: string; endMs?: string; snippet?: { runs?: { text: string }[] } } | null;
    const cue = transcriptCue(
      Number(segment?.startMs) / 1000,
      Number(segment?.endMs) / 1000,
      segment?.snippet?.runs?.map(({ text }) => text).join('') ?? '',
    );
    if (cue) cues.push(cue);
  }
  return finishTranscript(cues, language, trusted);
}

function parseModernSegments(data: unknown, language: ReaderLanguage): TranscriptCue[] {
  const cues: TranscriptCue[] = [];
  for (const value of valuesFor(data, 'transcriptSegmentViewModel')) {
    const segment = value as { simpleText?: string; timestamp?: string } | null;
    if (!segment?.timestamp || !/^\d+(?::\d{2}){1,2}$/.test(segment.timestamp)) continue;
    const start = segment.timestamp.split(':').reduce((time, part) => time * 60 + Number(part), 0);
    const cue = transcriptCue(start, undefined, segment.simpleText ?? '');
    if (cue) cues.push(cue);
  }
  const sorted = finishTranscript(cues, language);
  return sorted.map((cue, index) => ({ ...cue, end: sorted[index + 1]?.start }));
}

async function loadModernPanel(videoId: string, watchData: unknown, context: YouTubeContext, signal: AbortSignal, language: ReaderLanguage) {
  const panelId = 'PAmodern_transcript_view';
  const panels = [...valuesFor(watchData, 'tag')];
  if (!panels.includes(panelId) || !/^[\w-]{11}$/.test(videoId)) return [];
  // YouTube's panel parameters wrap the 11 ASCII bytes of the video ID and a mode flag.
  const params = btoa('\xaa\x09\x0f\x0a\x0b' + videoId + '\x18\x01');
  const response = await fetch('/youtubei/v1/get_panel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: { ...context, client: { ...context.client, hl: language } }, panelId, params }),
    signal,
    redirect: 'error',
  });
  return response.ok ? parseModernSegments(await response.json(), language) : [];
}

async function load(videoId: string, signal: AbortSignal, language: ReaderLanguage): Promise<TranscriptCue[]> {
  const player = document.querySelector('#movie_player') as (HTMLElement & { getPlayerResponse?: () => PlayerResponse }) | null;
  const watch = document.querySelector<YouTubeWatch>('ytd-watch-flexy');
  const page = window as Window & {
    ytInitialPlayerResponse?: PlayerResponse;
    ytInitialData?: unknown;
    ytcfg?: { get: (key: string) => unknown };
  };
  const playerResponse = [player?.getPlayerResponse?.(), watch?.data?.playerResponse, page.ytInitialPlayerResponse]
    .find((response) => response?.videoDetails?.videoId === videoId);
  if (playerResponse?.videoDetails?.isLive) return [];

  const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const matching = tracks.filter((track) => track.languageCode?.toLowerCase().split('-')[0] === language)
    .sort((a, b) => Number(a.kind === 'asr') - Number(b.kind === 'asr'));
  for (const track of matching) {
    if (!track.baseUrl) continue;
    try {
      const url = new URL(track.baseUrl, location.origin);
      if (url.origin === location.origin && url.pathname === '/api/timedtext') {
        url.searchParams.set('fmt', 'json3');
        const response = await fetch(url, { signal, redirect: 'error' });
        if (response.ok) {
          const data = await response.json() as { events?: { tStartMs: number; dDurationMs: number; segs?: { utf8: string }[] }[] };
          const cues = (data.events ?? []).flatMap((event) => transcriptCue(
            event.tStartMs / 1000,
            (event.tStartMs + event.dDurationMs) / 1000,
            event.segs?.map(({ utf8 }) => utf8).join('') ?? '',
          ) ?? []);
          const result = finishTranscript(cues, language, true);
          if (result.length) return result;
        }
      }
    } catch {
      signal.throwIfAborted();
    }
  }

  // Use the same transcript endpoint as the watch page when timed text is unavailable.
  const watchData = (watch?.getAttribute('video-id') === videoId && watch.data?.response) ||
    (page.ytInitialPlayerResponse?.videoDetails?.videoId === videoId && page.ytInitialData);
  const context = page.ytcfg?.get('INNERTUBE_CONTEXT');
  if (!watchData || !context || typeof context !== 'object') return [];
  try {
    const modern = await loadModernPanel(videoId, watchData, context, signal, language);
    if (modern.length) return modern;
  } catch {
    signal.throwIfAborted();
  }
  const params = transcriptParams(watchData);
  if (!params) return [];
  const getTranscript = async (params: string) => {
    const response = await fetch('/youtubei/v1/get_transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, params }),
      signal,
      redirect: 'error',
    });
    return response.ok ? await response.json() : null;
  };
  const data = await getTranscript(params);
  for (const value of valuesFor(data, 'subMenuItemRenderer')) {
    const item = value as {
      title?: string;
      selected?: boolean;
      continuation?: { reloadContinuationData?: { continuation?: string } };
    } | null;
    const matchedParams = item?.continuation?.reloadContinuationData?.continuation;
    const label = language === 'ja' ? /^(?:Japanese\b|日本語)/i : /^(?:Korean\b|한국어)/i;
    if (typeof item?.title === 'string' && label.test(item.title)) {
      if (item.selected) return parseSegments(data, language, true);
      if (!matchedParams) continue;
      const matched = parseSegments(await getTranscript(matchedParams), language, true);
      if (matched.length) return matched;
    }
  }
  return parseSegments(data, language);
}

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    document.addEventListener(CAPTION_TRACK_REQUEST, () => {
      const player = document.querySelector('#movie_player') as (HTMLElement & {
        getOption?: (module: string, option: string) => { languageCode?: unknown; translationLanguage?: { languageCode?: unknown }; kind?: unknown } | null;
      }) | null;
      try {
        const track = player?.getOption?.('captions', 'track');
        const language = track?.translationLanguage?.languageCode ?? track?.languageCode;
        if (typeof language === 'string') {
          document.dispatchEvent(new CustomEvent(CAPTION_TRACK_RESPONSE, {
            detail: { language, label: '', kind: typeof track?.kind === 'string' ? track.kind : 'subtitles' },
          }));
        }
      } catch {
        // The caption monitor can fall back to browser tracks or script detection.
      }
    });
    let request: AbortController | undefined;
    document.addEventListener(TRANSCRIPT_REQUEST, async (event) => {
      const detail = (event as CustomEvent<{ videoId: string; requestId: number; language?: ReaderLanguage }>).detail;
      if (!detail || location.pathname !== '/watch' ||
          detail.videoId !== new URLSearchParams(location.search).get('v')) return;
      request?.abort();
      request = new AbortController();
      const { signal } = request;
      let cues: TranscriptCue[] = [];
      try {
        cues = await load(detail.videoId, AbortSignal.any([signal, AbortSignal.timeout(5500)]), readingLanguage(detail.language));
      } catch {
        // The live caption monitor will supply the transcript instead.
      }
      if (!signal.aborted) document.dispatchEvent(new CustomEvent(TRANSCRIPT_RESPONSE, {
        detail: { ...detail, cues },
      }));
    });
  },
});
