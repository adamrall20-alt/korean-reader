import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import SettingsPanel from '@/components/SettingsPanel.vue';

vi.mock('wxt/browser', () => ({
  browser: { runtime: { getURL: () => 'chrome-extension://test/', sendMessage: vi.fn() } },
}));

describe('SettingsPanel', () => {
  it('renders the settings headings and all planned categories', () => {
    const wrapper = mount(SettingsPanel);
    const text = wrapper.text();

    expect(wrapper.get('h1').text()).toBe('Settings');

    for (const category of ['General', 'Dictionary', 'Anki', 'Appearance', 'Storage']) {
      expect(text).toContain(category);
      expect(wrapper.find(`#${category.toLowerCase()}`).exists()).toBe(true);
    }
  });

  it('does not present placeholder sections as working settings', () => {
    const wrapper = mount(SettingsPanel);
    const placeholders = wrapper.findAll('section p').filter((node) =>
      node.text().includes('placeholder'),
    );

    expect(placeholders).toHaveLength(2);
    expect(wrapper.find('#krdict-api-key').exists()).toBe(true);
    expect(wrapper.get('#anki').text()).toContain('Connect Anki');
  });
});
