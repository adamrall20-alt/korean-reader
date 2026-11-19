import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TranscriptSidebar from '@/components/TranscriptSidebar.vue';
import { clearTokenizeCache, tokenizeLines } from '@/services/korean/tokenize-client';
import { DEFAULT_SUBTITLE_APPEARANCE } from '@/types/preferences';

const { sendMessage } = vi.hoisted(() => ({ sendMessage: vi.fn() }));
vi.mock('wxt/browser', () => ({ browser: { runtime: { sendMessage } } }));
vi.mock('@/services/youtube/captions', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/youtube/captions')>(),
  getYouTubeVideoId: () => 'fixture',
}));

const cues = [
  { start: 2, end: 4, text: '안녕하세요.' },
  { start: 6, end: 9, text: '사과를 먹어요.' },
];

function mountSidebar() {
  return mount(TranscriptSidebar, {
    props: {
      cues, active: cues[1], status: 'full', theme: 'dark',
      appearance: DEFAULT_SUBTITLE_APPEARANCE, knownHeadwords: new Set<string>(),
      videoId: 'fixture', width: 360, follow: true, prepareAudio: () => async () => undefined,
    },
  });
}

afterEach(() => {
  document.body.replaceChildren();
  clearTokenizeCache();
  sendMessage.mockReset();
  vi.unstubAllGlobals();
});

describe('transcript sidebar', () => {
  it('highlights the active cue, filters by phrase and exposes seek and follow controls', async () => {
    const video = document.createElement('video');
    document.body.append(video);
    const wrapper = mountSidebar();
    expect(wrapper.get('[aria-current="true"]').text()).toContain(cues[1]!.text);
    await wrapper.get('input[type="search"]').setValue('사과를 먹어요');
    expect(wrapper.findAll('.kr-transcript-row')).toHaveLength(1);
    await wrapper.get('.kr-transcript-seek').trigger('click');
    expect(video.currentTime).toBe(6);
    await wrapper.get('input[type="checkbox"]').setValue(false);
    expect(wrapper.emitted('follow')).toEqual([[false]]);
    await wrapper.get('input[type="search"]').setValue('없는 말');
    expect(wrapper.text()).toContain('No matching subtitles');
  });

  it('scrolls the list to a later cue only when auto-scroll is enabled', async () => {
    const wrapper = mountSidebar();
    const list = wrapper.get('ol').element;
    const [first, second] = wrapper.findAll('.kr-transcript-row');
    const bounds = (top: number, height: number) => ({ top, bottom: top + height, height }) as DOMRect;
    vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(bounds(0, 100));
    vi.spyOn(first!.element, 'getBoundingClientRect').mockReturnValue(bounds(0, 30));
    vi.spyOn(second!.element, 'getBoundingClientRect').mockReturnValue(bounds(180, 30));
    await wrapper.setProps({ active: cues[0], follow: false });
    await wrapper.setProps({ active: cues[1] });
    expect(list.scrollTop).toBe(0);
    await wrapper.setProps({ follow: true });
    expect(list.scrollTop).toBe(145);
  });

  it('pauses and opens the shared dictionary without seeking, then mines using the selected cue time', async () => {
    sendMessage.mockImplementation(async (message) => message.type === 'lookup' ? {
      ok: true,
      entry: {
        headword: '사과', originalForm: '사과를', definitions: ['apple'], koreanDefinitions: [], examples: [],
      },
    } : { ok: true, outcome: 'mined' });
    const video = document.createElement('video');
    document.body.append(video);
    video.currentTime = 18;
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => undefined);
    const wrapper = mountSidebar();
    await wrapper.findAll('.kr-word-token')[1]!.trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="dialog"]').text()).toContain('apple');
    expect(video.currentTime).toBe(18);
    expect(pause).toHaveBeenCalledOnce();

    await wrapper.get('.kr-mine-button').trigger('click');
    await flushPromises();
    expect(video.currentTime).toBe(6);
    expect(pause).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'mine-word',
      context: expect.objectContaining({
        sentence: cues[1]!.text,
        timestamp: 6,
        sourceUrl: 'https://www.youtube.com/watch?v=fixture',
        originalForm: '사과를',
      }),
    }));
  });

  it('shows the existing mining error when no video is available', async () => {
    sendMessage.mockResolvedValue({
      ok: true,
      entry: {
        headword: '사과', originalForm: '사과를', definitions: ['apple'], koreanDefinitions: [], examples: [],
      },
    });
    const wrapper = mountSidebar();
    await wrapper.findAll('.kr-word-token')[1]!.trigger('click');
    await flushPromises();
    await wrapper.get('.kr-mine-button').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="dialog"]').text()).toContain('Could not save the word');
    expect(sendMessage.mock.calls.every(([message]) => message.type !== 'mine-word')).toBe(true);
  });

  it('batches visible rows into one tokenize request and reuses cached lines across mounts', async () => {
    const observed: Element[] = [];
    let notify!: IntersectionObserverCallback;
    const FakeObserver = class {
      constructor(callback: IntersectionObserverCallback) { notify = callback; }
      observe = vi.fn((element: Element) => { observed.push(element); });
      unobserve = vi.fn();
      disconnect = vi.fn();
    };
    vi.stubGlobal('IntersectionObserver', FakeObserver);

    sendMessage.mockImplementation(async (message) => ({
      ok: true,
      lines: (message.lines as string[]).map((text, lineIndex) => ({
        text,
        tokens: [{
          id: `${lineIndex}:0`,
          text,
          start: 0,
          length: text.length,
          clickable: true,
          morphemes: [{ text, tag: 'NNG', position: 0, length: text.length }],
        }],
      })),
    }));

    const mixedCues = [
      { start: 1, end: 2, text: '[Music]' },
      { start: 2, end: 4, text: '안녕하세요.' },
      { start: 5, end: 7, text: '안녕하세요.' },
      { start: 8, end: 10, text: '감사합니다.' },
    ];
    const wrapper = mount(TranscriptSidebar, {
      props: {
        cues: mixedCues, active: mixedCues[1], status: 'full', theme: 'dark',
        appearance: DEFAULT_SUBTITLE_APPEARANCE, knownHeadwords: new Set<string>(),
        videoId: 'fixture', width: 360, follow: true, prepareAudio: () => async () => undefined,
      },
    });

    // Non-Korean rows are skipped rather than observed for tokenization.
    expect(observed).toHaveLength(3);
    notify(
      observed.map((target) => ({ isIntersecting: true, target }) as IntersectionObserverEntry),
      { unobserve: vi.fn() } as unknown as IntersectionObserver,
    );
    await flushPromises();

    const tokenizeCalls = sendMessage.mock.calls.filter(([message]) => message.type === 'tokenize');
    expect(tokenizeCalls).toHaveLength(1);
    expect(tokenizeCalls[0]![0].lines).toEqual(['안녕하세요.', '감사합니다.']);

    // Reopening the sidebar or rewinding the overlay reuses the shared cache with zero IPC calls.
    sendMessage.mockClear();
    observed.length = 0;
    mount(TranscriptSidebar, {
      props: {
        cues: mixedCues, active: mixedCues[1], status: 'full', theme: 'dark',
        appearance: DEFAULT_SUBTITLE_APPEARANCE, knownHeadwords: new Set<string>(),
        videoId: 'fixture', width: 360, follow: true, prepareAudio: () => async () => undefined,
      },
    });
    expect(observed).toHaveLength(0);
    await tokenizeLines(['안녕하세요.', '감사합니다.']);
    expect(sendMessage).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
