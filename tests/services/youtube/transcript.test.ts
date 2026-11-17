import { describe, expect, it } from 'vitest';
import {
  activeTranscriptCue, collectTranscriptCue, finishTranscript, formatTranscriptTime, seekTranscriptVideo,
  transcriptCue,
} from '@/services/youtube/transcript';

describe('transcript cues', () => {
  it('normalises and validates cue text and times', () => {
    expect(transcriptCue(0, 1.2, '  안녕\u00a0 하세요\u200b ')).toEqual({ start: 0, end: 1.2, text: '안녕 하세요' });
    expect(transcriptCue(NaN, 1, '안녕')).toBeUndefined();
    expect(transcriptCue(0, 1, '  ')).toBeUndefined();
    expect(finishTranscript([{ start: 0, text: 'English only' }])).toEqual([]);
  });

  it('tracks playback across gaps and backward seeks', () => {
    const first = { start: 2, end: 3, text: '안녕' };
    const second = { start: 6, end: 9, text: '반가워요' };
    const cues = finishTranscript([second, first]);
    expect(activeTranscriptCue(cues, 0)).toBeUndefined();
    expect(activeTranscriptCue(cues, 6)).toBe(second);
    expect(activeTranscriptCue(cues, 3)).toBeUndefined();
    expect(activeTranscriptCue(cues, 2)).toBe(first);
  });

  it('keeps collected subtitles in playback order and ignores a replayed cue', () => {
    const first = { start: 2, end: 4, text: '안녕' };
    const later = { start: 8, text: '안녕' };
    const { cues } = collectTranscriptCue([later], first);
    expect(cues).toEqual([first, later]);
    expect(collectTranscriptCue(cues, { ...first, start: 3 })).toEqual({ cues, selected: first });
    expect(formatTranscriptTime(3781.25)).toBe('1:03:01');
  });

  it('rejects a cancelled seek without moving the video', async () => {
    const video = document.createElement('video');
    await expect(seekTranscriptVideo(video, 10, AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' });
    expect(video.currentTime).toBe(0);
  });
});
