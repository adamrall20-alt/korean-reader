import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import SettingsPanel from '@/components/SettingsPanel.vue';
import { DEFAULT_SUBTITLE_APPEARANCE } from '@/types/preferences';
import { ANKI_DEFAULT_FIELDS, DEFAULT_ANKI_SETTINGS } from '@/types/anki';

const { sendMessage } = vi.hoisted(() => ({ sendMessage: vi.fn() }));

vi.mock('wxt/browser', () => ({
  browser: { runtime: { getURL: () => 'chrome-extension://test/', sendMessage } },
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

  it('previews a separate import deck and refreshes vocabulary after confirmation', async () => {
    const settings = { ...DEFAULT_ANKI_SETTINGS, deckName: 'Mining' };
    const imported = {
      headword: '학생', originalForm: '학생', status: 'known', contexts: [],
      definitions: [], koreanDefinitions: [], createdAt: '2026-11-17T00:00:00Z',
    };
    let entries: unknown[] = [];
    sendMessage.mockImplementation(async (message) => {
      switch (message.type) {
        case 'get-preferences': return { ok: true, theme: 'dark', appearance: DEFAULT_SUBTITLE_APPEARANCE };
        case 'get-anki-settings': return { ok: true, settings };
        case 'connect-anki': return { ok: true, decks: ['Mining', 'Study'], models: [settings.modelName] };
        case 'get-anki-fields': return { ok: true, fields: Object.values(ANKI_DEFAULT_FIELDS) };
        case 'preview-anki-import':
          return { ok: true, importPreview: { headwords: ['학생'], total: 2, alreadyKnown: 1, skipped: 1 } };
        case 'import-anki-words':
          entries = [imported];
          return { ok: true, markedKnown: 1 };
        case 'list-vocabulary': return { ok: true, entries };
        default: return { ok: true };
      }
    });
    try {
      const wrapper = mount(SettingsPanel);
      await flushPromises();
      const button = (label: string) => wrapper.findAll('button').find((node) => node.text() === label)!;
      await button('Connect Anki').trigger('click');
      await flushPromises();
      const section = wrapper.get('[aria-labelledby="anki-import-heading"]');
      await section.get('select').setValue('Study');
      await button('Preview import').trigger('click');
      await flushPromises();
      expect(sendMessage).toHaveBeenCalledWith({ type: 'preview-anki-import', settings, deckName: 'Study' });
      expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'import-anki-words' }));
      expect(section.text()).toContain('1 already known');
      expect(section.text()).toContain('학생');
      await button('Mark words known').trigger('click');
      await flushPromises();
      expect(sendMessage).toHaveBeenCalledWith({ type: 'import-anki-words', headwords: ['학생'] });
      expect(wrapper.get('#anki').text()).toContain('1 word marked known.');
      expect(wrapper.get('#storage').get('[role="switch"]').attributes('aria-checked')).toBe('true');
    } finally {
      sendMessage.mockReset();
    }
  });
});
