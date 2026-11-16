import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import WordToken from '@/components/WordToken.vue';

describe('WordToken', () => {
  it('renders the supplied word without changing it', () => {
    const wrapper = mount(WordToken, {
      props: { word: '안녕하세요' },
    });

    expect(wrapper.text()).toBe('안녕하세요');
  });
});
