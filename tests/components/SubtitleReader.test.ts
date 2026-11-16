import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SubtitleReader from '@/components/SubtitleReader.vue';

describe('SubtitleReader', () => {
  it('renders each visible subtitle line', () => {
    const wrapper = mount(SubtitleReader, {
      props: {
        lines: ['안녕하세요', '반갑습니다'],
        visible: true,
      },
    });

    expect(wrapper.findAll('.kr-subtitle-line')).toHaveLength(2);
    expect(wrapper.text()).toContain('안녕하세요');
    expect(wrapper.text()).toContain('반갑습니다');
    expect(wrapper.get('[role="region"]').attributes('lang')).toBe('ko');
  });

  it('renders nothing when hidden', () => {
    const wrapper = mount(SubtitleReader, {
      props: {
        lines: ['안녕하세요'],
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
