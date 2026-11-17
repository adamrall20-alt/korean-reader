import { afterEach, describe, expect, it, vi } from 'vitest';
import { NATIVE_CAPTION_HIDDEN_CLASS } from '@/services/youtube/native-captions';
import { createSubtitlePresenter } from '@/services/youtube/presenter';
import type { SubtitleOverlay } from '@/services/youtube/overlay';
import type { CaptionSnapshot } from '@/types/youtube';
import type { TokenizedSubtitleLine } from '@/types/messages';

const tokenizedLines: TokenizedSubtitleLine[] = [
  {
    text: '안녕하세요',
    tokens: [
      {
        id: '0:0',
        text: '안녕하세요',
        start: 0,
        length: 5,
        clickable: true,
        morphemes: [],
      },
    ],
  },
];

function makeSnapshot(overrides: Partial<CaptionSnapshot> = {}): CaptionSnapshot {
  return {
    lines: ['안녕하세요'],
    text: '안녕하세요',
    isKorean: true,
    timestamp: 12.5,
    videoId: 'abc123',
    hasVideo: true,
    hasNativeCaptions: true,
    activeTrack: null,
    availableTracks: [],
    ...overrides,
  };
}

function setupPlayer(): HTMLElement {
  document.body.innerHTML = `
    <div id="movie_player" class="html5-video-player">
      <video></video>
    </div>
  `;

  return document.querySelector<HTMLElement>('#movie_player')!;
}

function makeOverlay(): SubtitleOverlay {
  return {
    update: vi.fn(),
    setKnownHeadwords: vi.fn(),
    setTheme: vi.fn(),
    setAppearance: vi.fn(),
    hide: vi.fn(),
    destroy: vi.fn(),
  };
}

describe('subtitle presenter', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.getElementById('korean-reader-native-caption-style')?.remove();
    vi.useRealTimers();
  });

  it('shows the overlay and hides native captions for Korean text', () => {
    const player = setupPlayer();
    const overlay = makeOverlay();
    const presenter = createSubtitlePresenter({ document, overlay });
    const snapshot = makeSnapshot();

    presenter.update(snapshot, tokenizedLines);

    expect(overlay.update).toHaveBeenCalledWith(snapshot, player, tokenizedLines);
    expect(player.classList.contains(NATIVE_CAPTION_HIDDEN_CLASS)).toBe(true);
    expect(overlay.hide).not.toHaveBeenCalled();

    presenter.destroy();
  });

  it('hides native captions only on the active player', () => {
    vi.useFakeTimers();
    const player = setupPlayer();
    const miniplayer = document.createElement('div');
    miniplayer.className = 'html5-video-player miniplayer';
    document.body.append(miniplayer);

    const overlay = makeOverlay();
    const presenter = createSubtitlePresenter({ document, overlay });

    presenter.update(makeSnapshot(), tokenizedLines);

    expect(player.classList.contains(NATIVE_CAPTION_HIDDEN_CLASS)).toBe(true);
    expect(miniplayer.classList.contains(NATIVE_CAPTION_HIDDEN_CLASS)).toBe(false);

    presenter.update(makeSnapshot({ lines: [], text: '', isKorean: false }));
    vi.advanceTimersByTime(500);
    expect(player.classList.contains(NATIVE_CAPTION_HIDDEN_CLASS)).toBe(false);

    presenter.destroy();
  });

  it('restores native captions after a short delay when captions disappear', () => {
    vi.useFakeTimers();
    const player = setupPlayer();
    const overlay = makeOverlay();
    const presenter = createSubtitlePresenter({ document, overlay });

    presenter.update(makeSnapshot(), tokenizedLines);
    presenter.update(makeSnapshot({ lines: [], text: '', isKorean: false, hasNativeCaptions: false }));

    expect(player.classList.contains(NATIVE_CAPTION_HIDDEN_CLASS)).toBe(true);
    vi.advanceTimersByTime(499);
    expect(player.classList.contains(NATIVE_CAPTION_HIDDEN_CLASS)).toBe(true);

    vi.advanceTimersByTime(1);
    expect(player.classList.contains(NATIVE_CAPTION_HIDDEN_CLASS)).toBe(false);
    expect(overlay.hide).toHaveBeenCalled();

    presenter.destroy();
  });

  it('cancels the hide delay when Korean captions resume', () => {
    vi.useFakeTimers();
    const player = setupPlayer();
    const overlay = makeOverlay();
    const presenter = createSubtitlePresenter({ document, overlay });

    presenter.update(makeSnapshot(), tokenizedLines);
    presenter.update(makeSnapshot({ lines: [], text: '', isKorean: false }));
    vi.advanceTimersByTime(400);
    presenter.update(makeSnapshot(), tokenizedLines);

    vi.advanceTimersByTime(1000);

    expect(player.classList.contains(NATIVE_CAPTION_HIDDEN_CLASS)).toBe(true);
    expect(overlay.hide).not.toHaveBeenCalled();

    presenter.destroy();
  });

  it('hides immediately when the video changes', () => {
    const player = setupPlayer();
    const overlay = makeOverlay();
    const presenter = createSubtitlePresenter({ document, overlay });

    presenter.update(makeSnapshot(), tokenizedLines);
    presenter.update(makeSnapshot({ videoId: 'def456', lines: [], text: '', isKorean: false }));

    expect(player.classList.contains(NATIVE_CAPTION_HIDDEN_CLASS)).toBe(false);
    expect(overlay.hide).toHaveBeenCalled();

    presenter.destroy();
  });

  it('does not show anything without a player or video', () => {
    const overlay = makeOverlay();
    const presenter = createSubtitlePresenter({ document, overlay });

    presenter.update(makeSnapshot({ hasVideo: false }));
    expect(overlay.update).not.toHaveBeenCalled();
    expect(overlay.hide).not.toHaveBeenCalled();

    presenter.update(makeSnapshot());
    expect(overlay.update).not.toHaveBeenCalled();

    presenter.destroy();
  });
});
