import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createSubtitleOverlay,
  SUBTITLE_OVERLAY_HOST_ID,
} from '@/services/youtube/overlay';
import type { CaptionSnapshot } from '@/types/youtube';

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

describe('subtitle overlay', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('mounts inside the player and renders the current line', async () => {
    const player = document.createElement('div');
    player.className = 'html5-video-player';
    document.body.append(player);

    const overlay = createSubtitleOverlay(document);

    try {
      overlay.update(makeSnapshot(), player);
      await nextTick();

      const host = player.querySelector<HTMLElement>(`#${SUBTITLE_OVERLAY_HOST_ID}`);
      expect(host).not.toBeNull();
      expect(host?.shadowRoot?.textContent).toContain('안녕하세요');
      expect(host?.dataset.timestamp).toBe('12.500');
      expect(host?.dataset.videoId).toBe('abc123');

      overlay.hide();
      await nextTick();
      expect(host?.shadowRoot?.textContent).not.toContain('안녕하세요');
    } finally {
      overlay.destroy();
    }
  });

  it('does not create an overlay without a player', () => {
    const overlay = createSubtitleOverlay(document);

    try {
      overlay.update(makeSnapshot(), null);
      expect(document.querySelector(`#${SUBTITLE_OVERLAY_HOST_ID}`)).toBeNull();
    } finally {
      overlay.destroy();
    }
  });
});
