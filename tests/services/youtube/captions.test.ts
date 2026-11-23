import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CAPTION_TRACK_REQUEST, CAPTION_TRACK_RESPONSE,
  createCaptionMonitor,
  getYouTubeVideoId,
  hasKorean,
  isLanguageTrack,
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
    vi.restoreAllMocks();
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

  it('uses active track metadata before kana and allows kanji-only Japanese captions without metadata', () => {
    captionFixture('<div class="caption-window">食べなかった</div>');
    const read = () => readCaptionSnapshot(document, 'https://www.youtube.com/watch?v=example', 'ja');
    const track = () => document.dispatchEvent(new CustomEvent(CAPTION_TRACK_RESPONSE, {
      detail: { language: 'zh-Hant', label: '', kind: 'subtitles' },
    }));
    document.addEventListener(CAPTION_TRACK_REQUEST, track);
    expect(read().matchesLanguage).toBe(false);
    document.removeEventListener(CAPTION_TRACK_REQUEST, track);
    expect(read().matchesLanguage).toBe(true);
    captionFixture('<div class="caption-window">重要</div>');
    expect(read().matchesLanguage).toBe(true);
    expect(isLanguageTrack({ language: 'ja-JP', label: '', kind: 'asr' }, 'ja')).toBe(true);
    expect(isLanguageTrack({ language: 'ko', label: 'Japanese', kind: 'subtitles' }, 'ja')).toBe(false);
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
    expect(isLanguageTrack({ language: 'ko', label: 'Korean', kind: 'subtitles' }, 'ko')).toBe(true);
    expect(isLanguageTrack({ language: 'ko-KR', label: '', kind: 'subtitles' }, 'ko')).toBe(true);
    expect(isLanguageTrack({ language: 'en', label: '한국어', kind: 'subtitles' }, 'ko')).toBe(false);
    expect(isLanguageTrack({ language: 'en', label: 'English', kind: 'subtitles' }, 'ko')).toBe(false);
    expect(isLanguageTrack(null, 'ko')).toBe(false);
  });

  it('reads line breaks from caption DOM nodes without touching innerText', () => {
    captionFixture(`
      <div class="caption-window" id="br-lines">첫째 줄<br>둘째 줄<span style="display: none">숨김</span></div>
      <div class="caption-window" id="visual-lines">
        <span class="caption-visual-line">셋째 줄</span>
        <span class="caption-visual-line">넷째 줄</span>
      </div>
    `);

    const innerTextGetter = vi.fn(() => 'should not be read');
    for (const element of document.querySelectorAll<HTMLElement>('.caption-window')) {
      Object.defineProperty(element, 'innerText', { configurable: true, get: innerTextGetter });
    }

    expect(readVisibleCaptionLines(document)).toEqual(['첫째 줄\n둘째 줄', '셋째 줄\n넷째 줄']);
    expect(innerTextGetter).not.toHaveBeenCalled();
  });

  it('caches ancestor visibility and skips getComputedStyle for inline-hidden captions', () => {
    document.body.innerHTML = `
      <div id="movie_player" class="html5-video-player">
        <video></video>
        <div class="ytp-caption-window-container">
          <div class="caption-window">첫 문장</div>
          <div class="caption-window ytp-caption-window-rollup">
            <span class="caption-visual-line">둘째 문장</span>
          </div>
          <div class="caption-window" style="display: none">숨김</div>
          <div class="caption-window" aria-hidden="true">접근불가</div>
        </div>
      </div>
    `;
    const computedStyleSpy = vi.spyOn(window, 'getComputedStyle');

    const snapshot = readCaptionSnapshot(document, 'https://www.youtube.com/watch?v=abc123');
    expect(snapshot.lines).toEqual(['첫 문장', '둘째 문장']);
    expect(snapshot.isRolling).toBe(true);
    // Checked once each for the 2 visible windows, once for the container, and once for the player.
    expect(computedStyleSpy).toHaveBeenCalledTimes(4);
  });
});

describe('caption monitor', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    delete (document as unknown as Record<string, unknown>).hidden;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('groups word-by-word roll-up captions and clears the buffer on a video switch', async () => {
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
    await vi.advanceTimersByTimeAsync(250);
    line.textContent = '와요.';
    await vi.advanceTimersByTimeAsync(250);
    expect(updates.map(({ text }) => text)).toEqual(['']);
    await vi.advanceTimersByTimeAsync(500);
    expect(updates.at(-1)?.text).toBe('오늘은 비가 와요.');

    url = 'https://www.youtube.com/watch?v=second';
    line.textContent = '새 영상입니다.';
    monitor.refresh();
    expect(updates.at(-1)).toMatchObject({ videoId: 'second', text: '' });
    await vi.advanceTimersByTimeAsync(500);
    expect(updates.at(-1)?.text).toBe('새 영상입니다.');
    monitor.stop();
  });

  it('publishes roll-up phrases during a continuous stream and removes overlapping words', async () => {
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
      await vi.advanceTimersByTimeAsync(250);
    }
    expect(updates.at(-1)?.text).toBe('오늘 아침 일찍 일어나서 밥을 먹었어요.');
    document.querySelector('.caption-window')?.remove();
    await vi.advanceTimersByTimeAsync(250);
    expect(updates.at(-1)?.text).toBe('');
    monitor.stop();
  });

  it('uses MutationObserver without constant polling when the caption container is present', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="movie_player" class="html5-video-player">
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
    expect(vi.getTimerCount()).toBe(0);

    const caption = document.querySelector('.caption-window')!;
    caption.textContent = '잘 가';
    await Promise.resolve();
    expect(updates).toHaveLength(2);
    expect(updates[1]?.lines).toEqual(['잘 가']);

    caption.textContent = '잘 가';
    await Promise.resolve();
    expect(updates).toHaveLength(2);

    // Player class changes (like autohide or hiding native captions) do not trigger extra reads.
    document.getElementById('movie_player')!.classList.add('ytp-autohide');
    await Promise.resolve();
    expect(updates).toHaveLength(2);

    monitor.stop();
    caption.textContent = '중지됨';
    await Promise.resolve();
    expect(updates).toHaveLength(2);
  });

  it('falls back to polling until the caption container mounts, then switches to MutationObserver', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="movie_player" class="html5-video-player"><video></video></div>';

    const updates: CaptionSnapshot[] = [];
    const monitor = createCaptionMonitor({
      document,
      intervalMs: 250,
      locationHref: () => 'https://www.youtube.com/watch?v=abc123',
      onUpdate: (snapshot) => updates.push(snapshot),
    });

    monitor.start();
    expect(updates).toHaveLength(1);
    expect(updates[0]?.lines).toEqual([]);
    expect(vi.getTimerCount()).toBe(1);

    const container = document.createElement('div');
    container.className = 'ytp-caption-window-container';
    container.innerHTML = '<div class="caption-window">반가워요</div>';
    document.getElementById('movie_player')!.append(container);

    await Promise.resolve();
    expect(updates.at(-1)?.lines).toEqual(['반가워요']);
    expect(vi.getTimerCount()).toBe(0);

    monitor.stop();
  });

  it('pauses monitoring off video pages and resumes on navigation', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div class="html5-video-player">
        <video></video>
        <div class="ytp-caption-window-container">
          <div class="caption-window">첫 자막</div>
        </div>
      </div>
    `;

    let url = 'https://www.youtube.com/';
    const updates: CaptionSnapshot[] = [];
    const monitor = createCaptionMonitor({
      document,
      intervalMs: 250,
      locationHref: () => url,
      onUpdate: (snapshot) => updates.push(snapshot),
    });

    monitor.start();
    expect(updates).toHaveLength(1);
    expect(updates[0]?.videoId).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    const caption = document.querySelector('.caption-window')!;
    caption.textContent = '무시됨';
    await Promise.resolve();
    expect(updates).toHaveLength(1);

    url = 'https://www.youtube.com/watch?v=xyz789';
    caption.textContent = '영상 자막';
    monitor.refresh();
    expect(updates.at(-1)).toMatchObject({ videoId: 'xyz789', lines: ['영상 자막'] });

    caption.textContent = '다음 자막';
    await Promise.resolve();
    expect(updates.at(-1)?.lines).toEqual(['다음 자막']);

    url = 'https://www.youtube.com/';
    monitor.refresh();
    expect(updates.at(-1)?.videoId).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    caption.textContent = '홈 화면';
    await Promise.resolve();
    expect(updates.at(-1)?.videoId).toBeNull();

    monitor.stop();
  });

  it('pauses observers and pending rolling timers while the tab is hidden, then resumes when visible', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div class="html5-video-player">
        <video></video>
        <div class="ytp-caption-window-container">
          <div class="ytp-caption-window-rollup">
            <span class="caption-visual-line">숨기기</span>
          </div>
        </div>
      </div>
    `;
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });

    const updates: CaptionSnapshot[] = [];
    const monitor = createCaptionMonitor({
      document,
      intervalMs: 250,
      locationHref: () => 'https://www.youtube.com/watch?v=hide1',
      onUpdate: (snapshot) => updates.push(snapshot),
    });

    monitor.start();
    expect(vi.getTimerCount()).toBe(1);

    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(1500);
    expect(updates.map(({ text }) => text)).toEqual(['']);

    const container = document.querySelector('.ytp-caption-window-container')!;
    container.innerHTML = '<div class="caption-window">보임</div>';
    await Promise.resolve();
    expect(updates).toHaveLength(1);

    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(updates.at(-1)?.lines).toEqual(['보임']);

    monitor.stop();
  });
});
