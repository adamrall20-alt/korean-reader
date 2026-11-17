import { normaliseCaptionText } from './captions';

export const OPEN_TRANSCRIPT = 'open-transcript';
export const TRANSCRIPT_REQUEST = 'korean-reader-transcript-request';
export const TRANSCRIPT_RESPONSE = 'korean-reader-transcript-response';

export interface TranscriptCue {
  start: number;
  end?: number;
  observedAt?: number;
  text: string;
}

export function transcriptCue(start: unknown, end: unknown, raw: string): TranscriptCue | undefined {
  const text = normaliseCaptionText(raw);
  if (typeof start !== 'number' || !Number.isFinite(start) || start < 0 || !text) return;
  return {
    start,
    end: typeof end === 'number' && Number.isFinite(end) && end > start ? end : undefined,
    text,
  };
}

export function finishTranscript(cues: TranscriptCue[]): TranscriptCue[] {
  // YouTube's default transcript can be English with occasional Korean names or quotes.
  // Check the transcript as a whole so short foreign phrases in Korean captions stay intact.
  let letters = 0;
  let hangul = 0;
  for (const { text } of cues) {
    letters += text.match(/\p{L}/gu)?.length ?? 0;
    hangul += text.match(/[\p{L}&&\p{Script=Hangul}]/gv)?.length ?? 0;
  }
  return hangul * 2 > letters ? cues.sort((a, b) => a.start - b.start) : [];
}

export function activeTranscriptCue(cues: readonly TranscriptCue[], time: number): TranscriptCue | undefined {
  let low = 0;
  let high = cues.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (cues[mid]!.start <= time) low = mid + 1;
    else high = mid;
  }
  const cue = cues[low - 1];
  return cue && time < (cue.end ?? ((cue.observedAt ?? cue.start) + 1.5)) ? cue : undefined;
}

export function collectTranscriptCue(cues: readonly TranscriptCue[], cue: TranscriptCue): { cues: readonly TranscriptCue[]; selected: TranscriptCue } {
  const match = cues.find((previous) => previous.text === cue.text && (
    Math.abs(previous.start - cue.start) < 0.6 ||
    (cue.start >= previous.start && cue.start < (previous.end ?? previous.start))
  ));
  if (match) return { cues, selected: match };
  return { cues: [...cues, cue].sort((a, b) => a.start - b.start), selected: cue };
}

export function formatTranscriptTime(seconds: number): string {
  const value = Math.floor(seconds);
  const minutes = Math.floor(value / 60);
  const tail = String(value % 60).padStart(2, '0');
  return minutes < 60 ? `${minutes}:${tail}` :
    `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${tail}`;
}

export async function seekTranscriptVideo(video: HTMLVideoElement, time: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (Math.abs(video.currentTime - time) > 0.01) video.currentTime = time;
  if (!video.seeking) return;
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      timeout.removeEventListener('abort', onAbort);
    };
    const onSeeked = () => {
      cleanup();
      if (Math.abs(video.currentTime - time) <= 0.25) resolve();
      else reject(new Error('The video moved to another time.'));
    };
    const onAbort = () => {
      cleanup();
      reject(timeout.reason);
    };
    video.addEventListener('seeked', onSeeked);
    timeout.addEventListener('abort', onAbort);
  });
}
