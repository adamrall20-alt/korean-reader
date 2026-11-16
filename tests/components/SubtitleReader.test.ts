import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import SubtitleReader from '@/components/SubtitleReader.vue';
import type { TokenizedSubtitleLine } from '@/types/messages';

const lines: TokenizedSubtitleLine[] = [
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
  {
    text: '반갑습니다',
    tokens: [
      {
        id: '1:0',
        text: '반갑습니다',
        start: 0,
        length: 5,
        clickable: true,
        morphemes: [],
      },
    ],
  },
];

describe('SubtitleReader', () => {
  it('renders each visible subtitle line as clickable words', async () => {
    const wrapper = mount(SubtitleReader, {
      props: {
        lines,
        visible: true,
      },
    });

    expect(wrapper.findAll('.kr-subtitle-line')).toHaveLength(2);
    expect(wrapper.text()).toContain('안녕하세요');
    expect(wrapper.text()).toContain('반갑습니다');
    expect(wrapper.get('[role="region"]').attributes('lang')).toBe('ko');

    const firstWord = wrapper.get('button');
    await firstWord.trigger('click');
    expect(firstWord.classes()).toContain('kr-word-token-selected');
  });

  it('pauses the YouTube video when a word is clicked', async () => {
    const video = document.createElement('video');
    video.className = 'html5-main-video';
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => undefined);
    document.body.append(video);

    const wrapper = mount(SubtitleReader, {
      props: {
        lines: [lines[0]!],
        visible: true,
      },
    });

    await wrapper.get('button').trigger('click');

    expect(pause).toHaveBeenCalledOnce();
    wrapper.unmount();
    video.remove();
  });

  it('renders nothing when hidden', () => {
    const wrapper = mount(SubtitleReader, {
      props: {
        lines: [lines[0]!],
        visible: false,
      },
    });

    expect(wrapper.find('.kr-subtitles').exists()).toBe(false);
  });

  it('renders nothing when there are no lines', () => {
    const wrapper = mount(SubtitleReader, {
      props: {
        lines: [],
        visible: true,
      },
    });

    expect(wrapper.find('.kr-subtitles').exists()).toBe(false);
  });
});
