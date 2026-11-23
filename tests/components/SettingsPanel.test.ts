import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import SettingsPanel from '@/components/SettingsPanel.vue';
import { DEFAULT_SUBTITLE_APPEARANCE } from '@/types/preferences';

const { sendMessage } = vi.hoisted(() => ({ sendMessage: vi.fn() }));

vi.mock('wxt/browser', () => ({
  browser: { runtime: { getURL: () => 'chrome-extension://test/', sendMessage } },
}));

describe('SettingsPanel', () => {
  it('renders the settings headings and all planned categories', () => {
    const wrapper = mount(SettingsPanel);
    const text = wrapper.text();

    expect(wrapper.get('h1').text()).toBe('Settings');
    const pages = wrapper.get('nav[aria-label="Extension pages"]');
    expect(pages.get('a[aria-current="page"]').attributes('href')).toBe('/options.html');
    expect(pages.get('a[href="/statistics.html"]').text()).toBe('Statistics');
    const categories = wrapper.get('nav[aria-label="Settings sections"]');
    expect(categories.findAll('a svg[aria-hidden="true"]')).toHaveLength(6);

    for (const category of ['General', 'Dictionary', 'Anki', 'Known words transfer', 'Appearance', 'Storage']) {
      expect(text).toContain(category);
      expect(wrapper.find(`#${category === 'Known words transfer' ? 'import-known' : category.toLowerCase()}`).exists()).toBe(true);
    }
  });

  it('loads theme and subtitle preferences and saves each section independently', async () => {
    const savedAppearance = { ...DEFAULT_SUBTITLE_APPEARANCE, size: 120, font: 'serif' };
    sendMessage.mockImplementation(async ({ type, appearance }) => {
      if (type === 'get-preferences') return { ok: true, theme: 'dark', appearance: savedAppearance };
      if (type === 'set-interface-theme') return { ok: true, theme: 'light', appearance: savedAppearance };
      if (type === 'set-subtitle-appearance') return { ok: true, theme: 'light', appearance };
      return { ok: true };
    });
    try {
      const wrapper = mount(SettingsPanel);
      await flushPromises();
      expect(wrapper.get<HTMLSelectElement>('#appearance select').element.value).toBe('serif');
      expect(wrapper.get('#appearance .subtitle-preview').attributes('style')).toContain('--kr-subtitle-scale: 1.2');
      await wrapper.get('#general input[value="light"]').setValue(true);
      await wrapper.get('#general').get('form').trigger('submit');
      await flushPromises();
      expect(sendMessage).toHaveBeenCalledWith({ type: 'set-interface-theme', theme: 'light' });
      expect(wrapper.get('#general').text()).toContain('Theme saved.');

      await wrapper.get('#appearance input[type="range"]').setValue('150');
      await wrapper.get('#appearance input[type="color"]').setValue('#ffcc00');
      await wrapper.get('#appearance').get('form').trigger('submit');
      await flushPromises();
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'set-subtitle-appearance',
        appearance: { ...savedAppearance, size: 150, textColor: '#ffcc00' },
      });
      expect(wrapper.get('#appearance').text()).toContain('Subtitle appearance saved.');
      await wrapper.get('#appearance button[type="button"]').trigger('click');
      expect(wrapper.get<HTMLSelectElement>('#appearance select').element.value).toBe('rounded');
    } finally {
      sendMessage.mockReset();
    }
  });

  it('previews Korean focus words from Anki text and saves them only after confirmation', async () => {
    sendMessage.mockImplementation(async ({ type }) => {
      if (type === 'import-known-headwords') return { ok: true, marked: 1 };
      if (type === 'list-vocabulary') return { ok: true, entries: [] };
      return { ok: true, theme: 'dark', appearance: DEFAULT_SUBTITLE_APPEARANCE };
    });
    const wrapper = mount(SettingsPanel);
    const section = wrapper.get('#import-known');
    const input = section.get<HTMLInputElement>('input[accept*=".tsv"]');
    const file = new File(['#columns:Sentence\tFocus Word\n나는 학생이에요.\t학생\nOther\tEnglish'], 'notes.txt');
    Object.defineProperty(input.element, 'files', { value: [file] });
    await input.trigger('change');
    await flushPromises();
    expect(section.text()).toContain('학생');
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'import-known-headwords' }));
    await section.get('button[data-import]').trigger('click');
    await flushPromises();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'import-known-headwords', headwords: ['학생'] });
    expect(section.text()).toContain('1 word marked known.');
    sendMessage.mockReset();
  });
});
