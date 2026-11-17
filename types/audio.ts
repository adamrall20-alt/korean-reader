export const SUBTITLE_AUDIO_PREFIX = 'data:audio/webm;base64,';
export const MAX_AUDIO_BYTES = 256_000;

export function isSubtitleAudio(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length <= SUBTITLE_AUDIO_PREFIX.length + Math.ceil(MAX_AUDIO_BYTES / 3) * 4 &&
    value.startsWith(SUBTITLE_AUDIO_PREFIX) &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value.slice(SUBTITLE_AUDIO_PREFIX.length));
}
