import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCaptionMonitor,
  getYouTubeVideoId,
  hasKorean,
  isKoreanTrack,
  normaliseCaptionText,
  readCaptionSnapshot,
  readVisibleCaptionLines,
} from '@/services/youtube/captions';
import type { CaptionSnapshot } from '@/types/youtube';

function captionFixture(inner: string): void {
  document.body.innerHTML = `
    <div class="ytp-caption-window-container">
      ${inner}
    </div>
  `;
}

describe('YouTube caption helpers', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('detects Hangul in mixed text', () => {
    expect(hasKorean('안녕하세요')).toBe(true);
    expect(hasKorean('ㄱ')).toBe(true);
    expect(hasKorean('한국어 English')).toBe(true);
    expect(hasKorean('hello')).toBe(false);
    expect(hasKorean('')).toBe(false);
  });

  it('normalises caption whitespace without merging lines', () => {
    expect(normaliseCaptionText('  안녕\u00a0하세요 \n\n  여러분  ')).toBe('안녕 하세요\n여러분');
    expect(normaliseCaptionText('\u200b  \u00a0 ')).toBe('');
  });

  it('extracts video IDs from watch, shorts and live URLs', () => {
    expect(getYouTubeVideoId('https://www.youtube.com/watch?v=abc123&t=10')).toBe('abc123');
    expect(getYouTubeVideoId('https://m.youtube.com/watch?v=xyz789')).toBe('xyz789');
    expect(getYouTubeVideoId('https://www.youtube.com/shorts/short123')).toBe('short123');
    expect(getYouTubeVideoId('https://www.youtube.com/live/live123?feature=share')).toBe('live123');
    expect(getYouTubeVideoId('https://www.youtube.com/')).toBeNull();
    expect(getYouTubeVideoId('https://example.com/watch?v=abc123')).toBeNull();
    expect(getYouTubeVideoId('not a url')).toBeNull();
  });

  it('reads visible caption windows and ignores hidden or duplicate lines', () => {
    captionFixture(`
      <div class="caption-window" id="first">
        <span class="ytp-caption-segment">안녕하세요</span><span class="ytp-caption-segment"> 여러분</span>
      </div>
      <div class="caption-window" id="second">오늘은</div>
      <div class="caption-window" style="display: none">숨김</div>
      <div class="caption-window" style="opacity: 0">투명</div>
      <div class="caption-window" aria-hidden="true">접근불가</div>
      <div class="caption-window" id="duplicate">오늘은</div>
    `);

    expect(readVisibleCaptionLines(document)).toEqual(['안녕하세요 여러분', '오늘은']);
  });

  it('returns no lines when captions are not rendered', () => {
    expect(readVisibleCaptionLines(document)).toEqual([]);
  });

  it('builds a caption snapshot with text, timestamp and video metadata', () => {
    document.body.innerHTML = `
      <div id="movie_player" class="html5-video-player">
        <video class="html5-main-video"></video>
        <div class="ytp-caption-window-container">
          <div class="caption-window">안녕하세요</div>
        </div>
      </div>
    `;

    const video = document.querySelector('video');
    expect(video).not.toBeNull();
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 12.5 });

    const snapshot = readCaptionSnapshot(
      document,
      'https://www.youtube.com/watch?v=abc123',
    );

    expect(snapshot.lines).toEqual(['안녕하세요']);
    expect(snapshot.text).toBe('안녕하세요');
    expect(snapshot.isKorean).toBe(true);
    expect(snapshot.timestamp).toBe(12.5);
    expect(snapshot.videoId).toBe('abc123');
    expect(snapshot.hasVideo).toBe(true);
    expect(snapshot.hasNativeCaptions).toBe(true);
  });

  it('does not mark English captions as Korean', () => {
    document.body.innerHTML = `
      <div class="html5-video-player">
        <video></video>
        <div class="ytp-caption-window-container">
          <div class="caption-window">Hello everyone</div>
        </div>
      </div>
    `;

    const snapshot = readCaptionSnapshot(document, 'https://www.youtube.com/watch?v=abc123');

    expect(snapshot.isKorean).toBe(false);
    expect(snapshot.text).toBe('Hello everyone');
  });

  it('identifies Korean caption tracks by language code or label', () => {
    expect(isKoreanTrack({ language: 'ko', label: 'Korean', kind: 'subtitles' })).toBe(true);
    expect(isKoreanTrack({ language: 'ko-KR', label: '', kind: 'subtitles' })).toBe(true);
    expect(isKoreanTrack({ language: 'en', label: '한국어', kind: 'subtitles' })).toBe(true);
    expect(isKoreanTrack({ language: 'en', label: 'English', kind: 'subtitles' })).toBe(false);
    expect(isKoreanTrack(null)).toBe(false);
  });
});

describe('caption monitor', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('groups word-by-word roll-up captions and clears the buffer on a video switch', () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div class="html5-video-player">
        <video></video>
        <div class="ytp-caption-window-container">
          <div class="ytp-caption-window-rollup">
            <span class="caption-visual-line">오늘은</span>
          </div>
        </div>
      </div>
    `;
    const line = document.querySelector('.caption-visual-line')!;
    let url = 'https://www.youtube.com/watch?v=first';
    const updates: CaptionSnapshot[] = [];
    const monitor = createCaptionMonitor({
      document, intervalMs: 250, locationHref: () => url,
      onUpdate: (snapshot) => updates.push(snapshot),
    });
    monitor.start();
    line.textContent = '비가';
    vi.advanceTimersByTime(250);
    line.textContent = '와요.';
    vi.advanceTimersByTime(250);
    expect(updates.map(({ text }) => text)).toEqual(['']);
    vi.advanceTimersByTime(500);
    expect(updates.at(-1)?.text).toBe('오늘은 비가 와요.');

    url = 'https://www.youtube.com/watch?v=second';
    line.textContent = '새 영상입니다.';
    monitor.refresh();
    expect(updates.at(-1)).toMatchObject({ videoId: 'second', text: '' });
    vi.advanceTimersByTime(500);
    expect(updates.at(-1)?.text).toBe('새 영상입니다.');
    monitor.stop();
  });

  it('publishes roll-up phrases during a continuous stream and removes overlapping words', () => {
    vi.useFakeTimers();
    captionFixture('<div class="caption-window ytp-caption-window-rollup">오늘</div>');
    document.body.insertAdjacentHTML('afterbegin', '<video></video>');
    const window = document.querySelector('.caption-window')!;
    const updates: CaptionSnapshot[] = [];
    const monitor = createCaptionMonitor({
      document, intervalMs: 250, locationHref: () => 'https://www.youtube.com/watch?v=test',
      onUpdate: (snapshot) => updates.push(snapshot),
    });
    monitor.start();
    for (const text of ['오늘 아침', '아침 일찍', '일찍 일어나서', '일어나서 밥을', '밥을 먹었어요.']) {
      window.textContent = text;
      vi.advanceTimersByTime(250);
    }
    expect(updates.at(-1)?.text).toBe('오늘 아침 일찍 일어나서 밥을 먹었어요.');
    document.querySelector('.caption-window')?.remove();
    vi.advanceTimersByTime(250);
    expect(updates.at(-1)?.text).toBe('');
    monitor.stop();
  });

  it('emits when captions change and stays quiet when they do not', () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div class="html5-video-player">
        <video></video>
        <div class="ytp-caption-window-container">
          <div class="caption-window">안녕</div>
        </div>
      </div>
    `;

    const updates: CaptionSnapshot[] = [];
    const monitor = createCaptionMonitor({
      document,
      intervalMs: 100,
      locationHref: () => 'https://www.youtube.com/watch?v=abc123',
      onUpdate: (snapshot) => updates.push(snapshot),
    });

    monitor.start();
    expect(updates).toHaveLength(1);
    expect(updates[0]?.lines).toEqual(['안녕']);

    const caption = document.querySelector('.caption-window');
    expect(caption).not.toBeNull();
    caption!.textContent = '잘 가';

    vi.advanceTimersByTime(100);
    expect(updates).toHaveLength(2);
    expect(updates[1]?.lines).toEqual(['잘 가']);

    vi.advanceTimersByTime(100);
    expect(updates).toHaveLength(2);

    monitor.stop();
    vi.advanceTimersByTime(300);
    expect(updates).toHaveLength(2);
  });
});
