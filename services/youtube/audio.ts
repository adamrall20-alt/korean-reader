import { findPlayer, findVideo, getYouTubeVideoId, readVisibleCaptionLines } from '@/services/youtube/captions';
import { MAX_AUDIO_BYTES, SUBTITLE_AUDIO_PREFIX } from '@/types/audio';
import type { CaptionAudioTiming } from '@/types/youtube';

const MAX_CLIP_SECONDS = 12;
const RECORDING_TYPE = 'audio/webm;codecs=opus';

function waitForEvent(target: EventTarget, event: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const finish = () => {
      target.removeEventListener(event, finish);
      signal.removeEventListener('abort', cancel);
      resolve();
    };
    const cancel = () => {
      target.removeEventListener(event, finish);
      reject(signal.reason);
    };
    target.addEventListener(event, finish);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

async function readClip(blob: Blob): Promise<string | undefined> {
  if (!blob.size || blob.size > MAX_AUDIO_BYTES) return undefined;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return SUBTITLE_AUDIO_PREFIX + btoa(binary);
}

export async function captureSubtitleAudio(
  video: HTMLVideoElement,
  videoId: string,
  timing: CaptionAudioTiming,
  selectedAt: number,
  signal: AbortSignal,
): Promise<string | undefined> {
  const media = video as HTMLVideoElement & { captureStream?: () => MediaStream };
  const doc = video.ownerDocument;
  const player = findPlayer(doc);
  const sameVideo = () => findVideo(doc) === video && getYouTubeVideoId(doc.location.href) === videoId;
  const inAd = () => !!player?.classList.contains('ad-showing');
  if (!media.captureStream || typeof MediaRecorder === 'undefined' ||
      !MediaRecorder.isTypeSupported(RECORDING_TYPE) || !sameVideo() || inAd() ||
      !video.paused || video.seeking || Math.abs(video.currentTime - selectedAt) > 0.3) return;

  const { start, end, observedAt, caption } = timing;
  const from = Math.max(0, start - (end === undefined ? 0.25 : 0));
  const limit = Math.min(from + MAX_CLIP_SECONDS, video.duration);
  if (!Number.isFinite(limit) || !Number.isFinite(from) || from >= limit ||
      (end !== undefined ? end <= from || end > limit : observedAt >= limit) ||
      !Array.from({ length: video.seekable.length }, (_, i) => i)
        .some((i) => video.seekable.start(i) <= from && video.seekable.end(i) >= (end ?? observedAt))) return;

  const timeout = new AbortController();
  const session = AbortSignal.any([signal, timeout.signal]);
  const timer = setTimeout(() => timeout.abort(), 17_000);
  let tracks: MediaStreamTrack[] = [];
  let recorder: MediaRecorder | undefined;
  let meter: AudioContext | undefined;
  let moved = false;
  let monitoring = false;
  let userSeek = false;
  const abortOnSeek = () => {
    if (!monitoring) return;
    userSeek = true;
    timeout.abort();
  };
  const abortOnPause = () => { if (monitoring && !video.ended) timeout.abort(); };
  try {
    session.throwIfAborted();
    const stream = media.captureStream();
    tracks = stream.getTracks();
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    const audio = new MediaStream([track]);
    for (const other of stream.getVideoTracks()) other.stop();
    meter = new AudioContext();
    void meter.resume().catch(() => {});
    const analyser = meter.createAnalyser();
    meter.createMediaStreamSource(audio).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);

    moved = true;
    video.currentTime = from;
    if (video.seeking) await waitForEvent(video, 'seeked', session);
    if (!sameVideo() || inAd() || Math.abs(video.currentTime - from) > 0.25) return;

    recorder = new MediaRecorder(audio, { mimeType: RECORDING_TYPE, audioBitsPerSecond: 64_000 });
    const chunks: Blob[] = [];
    recorder.addEventListener('dataavailable', (event) => chunks.push(event.data));
    recorder.addEventListener('error', () => timeout.abort(), { once: true });
    recorder.start();
    monitoring = true;
    video.addEventListener('seeking', abortOnSeek);
    video.addEventListener('pause', abortOnPause);
    // Poll the media clock, since playback can buffer or run at a different speed.
    let sawCaption = false;
    let heardAudio = false;
    const reachedEnd = await new Promise<boolean>((resolve) => {
      const finish = (complete: boolean) => {
        clearInterval(poll);
        session.removeEventListener('abort', cancel);
        resolve(complete);
      };
      const cancel = () => finish(false);
      const poll = setInterval(() => {
        if (!sameVideo() || inAd()) return finish(false);
        analyser.getFloatTimeDomainData(samples);
        heardAudio ||= samples.some((sample) => Math.abs(sample) > 0.0001);
        const time = video.currentTime;
        if (end !== undefined) {
          if (time >= end) return finish(true);
        } else {
          const visible = readVisibleCaptionLines(player ?? doc).join('\n');
          if (visible === caption && time >= observedAt - 0.3) sawCaption = true;
          else if (sawCaption && time >= observedAt) return finish(true);
          if (video.ended && sawCaption) return finish(true);
        }
        if (video.ended || time >= limit || track.readyState === 'ended') finish(false);
      }, 40);
      session.addEventListener('abort', cancel, { once: true });
      void video.play().catch(cancel);
    });
    if (!reachedEnd || !heardAudio || recorder.state === 'inactive') return;
    monitoring = false;
    video.pause();
    const stopped = waitForEvent(recorder, 'stop', session);
    recorder.stop();
    await stopped;
    return await readClip(new Blob(chunks));
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
    video.removeEventListener('seeking', abortOnSeek);
    video.removeEventListener('pause', abortOnPause);
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    for (const track of tracks) track.stop();
    void meter?.close().catch(() => {});
    if (moved && sameVideo() && !inAd() && !userSeek && !video.seeking) {
      video.pause();
      video.currentTime = selectedAt;
    }
  }
}
