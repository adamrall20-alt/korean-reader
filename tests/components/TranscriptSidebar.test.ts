import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TranscriptSidebar from '@/components/TranscriptSidebar.vue';
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
  sendMessage.mockReset();
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

  it('opens the shared dictionary without seeking, then mines using the selected cue time', async () => {
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
    expect(pause).not.toHaveBeenCalled();

    await wrapper.get('.kr-mine-button').trigger('click');
    await flushPromises();
    expect(video.currentTime).toBe(6);
    expect(pause).toHaveBeenCalledOnce();
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
});
