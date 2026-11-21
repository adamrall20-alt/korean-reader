import { describe, expect, it, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { buildSourceLink, isSafeExternalUrl, type DesktopApi } from '../desktop/src/shared/api';
import { createSampleMinedEntry, createSampleWavDataUrl } from '../desktop/src/shared/fixtures';
import { runFsrsSpike } from '../desktop/src/shared/fsrs-spike';
import App from '../desktop/src/renderer/App.vue';

function createMockDesktopApi(overrides: Partial<DesktopApi> = {}): DesktopApi {
  const sample = createSampleMinedEntry();
  return {
    getStudyStats: vi.fn(),
    startPractice: vi.fn(),
    answerPractice: vi.fn(),
    importAnkiPackage: vi.fn(),
    getSampleEntry: vi.fn().mockResolvedValue(sample),
    getRuntimeInfo: vi.fn().mockResolvedValue({
      electron: '45.4.1',
      chrome: '138.0.0.0',
      node: '24.14.0',
      platform: 'darwin',
      arch: 'arm64',
      sqliteAvailable: true,
      fsrsVerified: true,
      fsrsPreview: runFsrsSpike(new Date('2026-11-21T00:00:00.000Z')),
    }),
    openExternalUrl: vi.fn().mockResolvedValue({ ok: true }),
    importVocabularyFile: vi.fn().mockResolvedValue({ ok: false, cancelled: true }),
    listCards: vi.fn().mockResolvedValue([]),
    getCardDetail: vi.fn().mockResolvedValue(null),
    getLibraryStats: vi.fn().mockResolvedValue({
      totalCards: 0,
      totalContexts: 0,
      newCards: 0,
      dueCards: 0,
      mediaAssets: 0,
    }),
    deleteCard: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

describe('Phase D0 desktop foundation', () => {
  afterEach(() => {
    delete window.koreanReaderDesktop;
    delete document.documentElement.dataset.theme;
    vi.restoreAllMocks();
  });

  it('produces a valid VocabularyEntry fixture with playable WAV audio', () => {
    const entry = createSampleMinedEntry();
    expect(entry.headword).toBe(entry.headword.normalize('NFC'));
    expect(entry.contexts).toHaveLength(1);
    const context = entry.contexts[0]!;
    expect(context.sentence).toContain(context.originalForm);
    expect(context.audio).toMatch(/^data:audio\/wav;base64,[A-Za-z0-9+/=]+$/);
    expect(createSampleWavDataUrl().length).toBeGreaterThan(100);
  });

  it('validates external URLs and builds timestamped source links', () => {
    expect(isSafeExternalUrl('https://www.youtube.com/watch?v=KTIByn_rIWM&t=84s')).toBe(true);
    expect(isSafeExternalUrl('http://127.0.0.1:8765')).toBe(true);
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('not-a-url')).toBe(false);

    expect(buildSourceLink('https://www.youtube.com/watch?v=abc', 84.9)).toBe(
      'https://www.youtube.com/watch?v=abc&t=84s',
    );
    expect(buildSourceLink('https://example.com/article', 12)).toBe(
      'https://example.com/article?t=12s',
    );
    expect(buildSourceLink('https://example.com/article')).toBe('https://example.com/article');
  });

  it('verifies ts-fsrs scheduling produces all four initial ratings', () => {
    const referenceDate = new Date('2026-11-21T00:00:00.000Z');
    const preview = runFsrsSpike(referenceDate);

    expect(preview.map((item) => item.rating)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
    for (const item of preview) {
      expect(Date.parse(item.dueIso)).toBeGreaterThanOrEqual(referenceDate.getTime());
      expect(item.scheduledDays).toBeGreaterThanOrEqual(0);
    }
    expect(preview[3]!.scheduledDays).toBeGreaterThanOrEqual(preview[2]!.scheduledDays);
  });

  it('renders empty state and toggles dark/light theme', async () => {
    window.koreanReaderDesktop = createMockDesktopApi();
    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.text()).toContain('No study cards imported yet');
    const themeBtn = wrapper.find('button[aria-label="Switch to light theme"]');
    expect(themeBtn.exists()).toBe(true);
    await themeBtn.trigger('click');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('shows a clear error when launched without the Electron preload bridge', async () => {
    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.text()).toContain('Desktop bridge unavailable');
  });
});
