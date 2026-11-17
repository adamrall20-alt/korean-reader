import type { CaptionAudioTiming, CaptionSnapshot, CaptionTrack } from '@/types/youtube';

const HANGUL_PATTERN = /[\u1100-\u11ff\u3131-\u318e\uac00-\ud7a3]/;
const CAPTION_WINDOW_SELECTOR = '.ytp-caption-window-container :is(.caption-window, .ytp-caption-window-rollup)';
const ROLLING_WINDOW = '.ytp-caption-window-rollup';
const ROLLING_SETTLE_MS = 450;
const ROLLING_MAX_WAIT_MS = 1250;
const PLAYER_SELECTOR = '#movie_player, .html5-video-player';
const VIDEO_SELECTOR = 'video.html5-main-video, video';

export function hasKorean(text: string): boolean {
  return HANGUL_PATTERN.test(text);
}

export function normaliseCaptionText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

export function getYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);

    if (parsed.hostname !== 'youtube.com' && !parsed.hostname.endsWith('.youtube.com')) {
      return null;
    }

    if (parsed.pathname === '/watch') {
      return parsed.searchParams.get('v');
    }

    const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/?#]+)/);
    if (shortsMatch?.[1]) {
      return shortsMatch[1];
    }

    const liveMatch = parsed.pathname.match(/^\/live\/([^/?#]+)/);
    if (liveMatch?.[1]) {
      return liveMatch[1];
    }
  } catch {
    return null;
  }

  return null;
}

export function findPlayer(doc: Document): HTMLElement | null {
  return (
    doc.querySelector<HTMLElement>('#movie_player') ??
    doc.querySelector<HTMLElement>(PLAYER_SELECTOR)
  );
}

export function findVideo(doc: Document): HTMLVideoElement | null {
  const player = findPlayer(doc);

  return (
    player?.querySelector<HTMLVideoElement>('video.html5-main-video') ??
    player?.querySelector<HTMLVideoElement>('video') ??
    doc.querySelector<HTMLVideoElement>(VIDEO_SELECTOR)
  );
}

export function readVideoTimestamp(video: HTMLVideoElement | null): number | null {
  if (!video) {
    return null;
  }

  const timestamp = video.currentTime;
  return Number.isFinite(timestamp) ? Math.max(0, timestamp) : null;
}

function readTrack(track: TextTrack): CaptionTrack {
  return {
    language: track.language ?? '',
    label: track.label ?? '',
    kind: track.kind ?? '',
  };
}

export function readCaptionTracks(video: HTMLVideoElement | null): CaptionTrack[] {
  if (!video?.textTracks) {
    return [];
  }

  const tracks: CaptionTrack[] = [];

  for (let index = 0; index < video.textTracks.length; index += 1) {
    const track = video.textTracks[index];
    if (!track || (!track.language && !track.label)) {
      continue;
    }

    tracks.push(readTrack(track));
  }

  return tracks;
}

export function findActiveCaptionTrack(video: HTMLVideoElement | null): CaptionTrack | null {
  if (!video?.textTracks) {
    return null;
  }

  for (let index = 0; index < video.textTracks.length; index += 1) {
    const track = video.textTracks[index];
    if (!track || track.mode === 'disabled') {
      continue;
    }

    return readTrack(track);
  }

  return null;
}

export function isKoreanTrack(track: CaptionTrack | null): boolean {
  if (!track) {
    return false;
  }

  return track.language.toLowerCase().startsWith('ko') || hasKorean(track.label);
}

function isHiddenByStyle(element: HTMLElement): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view) {
    return false;
  }

  const style = view.getComputedStyle(element);

  return (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.visibility === 'collapse' ||
    Number.parseFloat(style.opacity) === 0
  );
}

function isVisible(element: HTMLElement): boolean {
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') {
    return false;
  }

  if (isHiddenByStyle(element)) {
    return false;
  }

  const container = element.closest<HTMLElement>('.ytp-caption-window-container');
  if (container && container !== element && (container.hidden || isHiddenByStyle(container))) {
    return false;
  }

  const player = element.closest<HTMLElement>('.html5-video-player');
  if (player && (player.hidden || isHiddenByStyle(player))) {
    return false;
  }

  return true;
}

function readCaptionWindowText(captionWindow: HTMLElement): string {
  const visualLines = captionWindow.querySelectorAll<HTMLElement>('.caption-visual-line');
  if (captionWindow.matches(ROLLING_WINDOW) && visualLines.length) {
    return normaliseCaptionText(Array.from(visualLines, (line) => line.textContent ?? '').join('\n'));
  }

  const innerText = typeof captionWindow.innerText === 'string' ? captionWindow.innerText : '';
  const raw = innerText.trim() ? innerText : (captionWindow.textContent ?? '');

  return normaliseCaptionText(raw);
}

export function readVisibleCaptionLines(root: ParentNode): string[] {
  let captionWindows = Array.from(root.querySelectorAll<HTMLElement>(CAPTION_WINDOW_SELECTOR));

  if (captionWindows.length === 0) {
    captionWindows = Array.from(root.querySelectorAll<HTMLElement>('.caption-window, .ytp-caption-window-rollup'));
  }

  const lines: string[] = [];
  const seen = new Set<string>();

  for (const captionWindow of captionWindows) {
    if (!isVisible(captionWindow)) {
      continue;
    }

    const line = readCaptionWindowText(captionWindow);
    if (!line || seen.has(line)) {
      continue;
    }

    seen.add(line);
    lines.push(line);
  }

  return lines;
}

export function readCaptionSnapshot(
  doc: Document = document,
  url: string = doc.location?.href ?? '',
): CaptionSnapshot {
  const player = findPlayer(doc);
  const video = findVideo(doc);
  const lines = video?.seeking ? [] : readVisibleCaptionLines(player ?? doc);
  const text = lines.join('\n');
  const activeTrack = findActiveCaptionTrack(video);

  const timestamp = readVideoTimestamp(video);
  const audioTiming: CaptionAudioTiming | undefined = timestamp !== null && text ? { start: timestamp, observedAt: timestamp, caption: text } : undefined;
  if (audioTiming && video) {
    for (const track of Array.from(video.textTracks)) {
      const cues = Array.from(track.activeCues ?? []);
      if (track.mode === 'disabled' || !cues.length) continue;
      const cueText = normaliseCaptionText(cues.map((cue) => 'text' in cue ? String(cue.text) : '').join('\n'));
      if (cueText !== text) continue;
      audioTiming.start = Math.min(...cues.map((cue) => cue.startTime));
      audioTiming.end = Math.max(...cues.map((cue) => cue.endTime));
      break;
    }
  }

  return {
    audioTiming,
    lines,
    text,
    isKorean: hasKorean(text) || (text.length > 0 && isKoreanTrack(activeTrack)),
    timestamp,
    videoId: getYouTubeVideoId(url),
    hasVideo: video !== null,
    hasNativeCaptions: lines.length > 0,
    activeTrack,
    availableTracks: readCaptionTracks(video),
    isRolling: activeTrack?.kind === 'asr' ||
      Array.from((player ?? doc).querySelectorAll<HTMLElement>(ROLLING_WINDOW)).some(isVisible),
  };
}

interface RollingWord { text: string; time: number | null }

function mergeRollingWords(previous: RollingWord[], incoming: RollingWord[]): RollingWord[] {
  const overlap = Math.min(previous.length, incoming.length);
  for (let count = overlap; count > 0; count -= 1) {
    if (incoming.slice(0, count).every((word, index) => word.text === previous[previous.length - count + index]?.text)) {
      return [...previous, ...incoming.slice(count)].slice(-14);
    }
  }

  // Some roll-up windows expose only the newest spoken word.
  if (incoming.length === 1 && !/[.!?。！？]$/u.test(previous.at(-1)?.text ?? '')) {
    return [...previous, ...incoming].slice(-14);
  }
  return incoming.slice(-14);
}

export interface CaptionMonitorOptions {
  document?: Document;
  onUpdate: (snapshot: CaptionSnapshot) => void;
  intervalMs?: number;
  locationHref?: () => string;
}

export interface CaptionMonitor {
  start(): void;
  stop(): void;
  refresh(): void;
}

export function createCaptionMonitor({
  document: doc = document,
  onUpdate,
  intervalMs = 250,
  locationHref = () => doc.location?.href ?? '',
}: CaptionMonitorOptions): CaptionMonitor {
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastKey: string | null = null;

  let rolling: { words: RollingWord[]; firstChange: number; lastChange: number; pending: CaptionSnapshot } | null = null;
  let lastVideoId: string | null = null;

  const emitRolling = (now: number) => {
    if (!rolling || now - rolling.lastChange < ROLLING_SETTLE_MS &&
      now - rolling.firstChange < ROLLING_MAX_WAIT_MS) return;
    if (rolling.firstChange === Infinity) return;

    const text = rolling.words.map((word) => word.text).join(' ');
    const timing = rolling.pending.audioTiming;
    const audioTiming = timing && { ...timing, start: rolling.words[0]?.time ?? timing.start, end: undefined };
    onUpdate({ ...rolling.pending, text, lines: [text], audioTiming });
    rolling.firstChange = Infinity;
  };

  const read = () => {
    const snapshot = readCaptionSnapshot(doc, locationHref());
    const key = JSON.stringify([
      snapshot.videoId, snapshot.hasVideo, snapshot.lines, snapshot.isKorean,
      snapshot.activeTrack?.language, snapshot.isRolling,
    ]);
    const now = Date.now();
    if (key === lastKey) {
      emitRolling(now);
      return;
    }

    lastKey = key;
    const changedVideo = snapshot.videoId !== lastVideoId;
    lastVideoId = snapshot.videoId;
    if (changedVideo) rolling = null;
    if (!snapshot.isRolling || !snapshot.isKorean || !snapshot.hasVideo || !snapshot.videoId) {
      rolling = null;
      onUpdate(snapshot);
      return;
    }

    if (changedVideo) onUpdate({ ...snapshot, lines: [], text: '' });
    if (rolling && snapshot.timestamp !== null && rolling.pending.timestamp !== null) {
      const elapsed = snapshot.timestamp - rolling.pending.timestamp;
      if (elapsed < 0 || elapsed > 4) rolling = null;
    }
    const incoming = snapshot.lines.join(' ').split(/\s+/u).map((text) => ({ text, time: snapshot.timestamp }));
    rolling = {
      words: mergeRollingWords(rolling?.words ?? [], incoming),
      firstChange: Math.min(rolling?.firstChange ?? now, now),
      lastChange: now,
      pending: snapshot,
    };
    emitRolling(now);
  };

  return {
    start() {
      if (timer !== null) {
        return;
      }

      lastKey = null;
      rolling = null;
      read();
      timer = setInterval(read, intervalMs);
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
    refresh: read,
  };
}
