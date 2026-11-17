import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createSubtitleOverlay,
  SUBTITLE_OVERLAY_HOST_ID,
} from '@/services/youtube/overlay';
import { DEFAULT_SUBTITLE_APPEARANCE } from '@/types/preferences';
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
      overlay.update(makeSnapshot(), player, tokenizedLines);
      await nextTick();

      const host = player.querySelector<HTMLElement>(`#${SUBTITLE_OVERLAY_HOST_ID}`);
      expect(host).not.toBeNull();
      expect(host?.shadowRoot?.textContent).toContain('안녕하세요');
      expect(host?.dataset.timestamp).toBe('12.500');
      expect(host?.dataset.videoId).toBe('abc123');

      overlay.setTheme('light');
      overlay.setAppearance({ ...DEFAULT_SUBTITLE_APPEARANCE, font: 'serif', size: 125, underlineColor: '#99eeff' });
      await nextTick();
      const reader = host?.shadowRoot?.querySelector<HTMLElement>('.kr-subtitles');
      expect(reader?.dataset.theme).toBe('light');
      expect(reader?.style.getPropertyValue('--kr-subtitle-scale')).toBe('1.25');
      expect(reader?.style.getPropertyValue('--kr-subtitle-underline')).toBe('#99eeff');
      expect(reader?.style.getPropertyValue('--kr-subtitle-font')).toContain('Batang');

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
