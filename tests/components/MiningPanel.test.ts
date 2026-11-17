import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ANKI_DEFAULT_FIELDS, DEFAULT_ANKI_SETTINGS } from '@/types/anki';
import MiningPanel from '@/components/MiningPanel.vue';
import VocabularyManager from '@/components/VocabularyManager.vue';

const { sendMessage } = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      sendMessage,
      getManifest: () => ({ version: '0.1.0' }),
    },
  },
}));

describe('MiningPanel', () => {
  beforeEach(() => {
    sendMessage.mockReset();
  });

  it('shows counters and keeps management and configuration out of the popup', () => {
    const wrapper = mount(MiningPanel);
    expect(wrapper.text()).toContain('Known words');
    expect(wrapper.text()).toContain('New words');
    expect(wrapper.text()).not.toContain('Manage vocabulary');
    expect(wrapper.text()).not.toContain('Connection settings');
  });

  it('uses the Anki count and sends saved translations on explicit sync', async () => {
    const entry = {
      headword: '먹다',
      definitions: [],
      koreanDefinitions: ['밥을 먹는 행동.'],
      originalForm: '먹어요',
      examples: [],
      contexts: [{
        sentence: '밥을 먹어요.',
        originalForm: '먹어요',
        sourceTitle: 'Video',
        sourceUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
        minedAt: '2026-11-16T00:00:00.000Z',
      }],
      status: 'known',
      createdAt: '2026-11-16T00:00:00.000Z',
      updatedAt: '2026-11-16T00:00:00.000Z',
    };
    const settings = { ...DEFAULT_ANKI_SETTINGS, deckName: 'Korean' };
    const dismiss = vi.fn();
    const translate = vi.fn().mockResolvedValue('The act of eating.');
    vi.stubGlobal('Translator', { create: vi.fn().mockResolvedValue({ translate, destroy: dismiss }) });
    let unsynced = 1;
    sendMessage.mockImplementation(async (message) => {
      switch (message.type) {
        case 'list-vocabulary': return { ok: true, entries: [entry, { ...entry, headword: '이다', contexts: [] }] };
        case 'get-anki-settings': return { ok: true, settings };
        case 'connect-anki': return { ok: true, decks: ['Korean'], models: [settings.modelName] };
        case 'get-anki-fields': return { ok: true, fields: Object.values(ANKI_DEFAULT_FIELDS) };
        case 'count-unsynced': return { ok: true, unsynced };
        case 'sync-anki':
          unsynced = 0;
          return { ok: true, results: [{ headword: '먹다', status: 'created' }] };
      }
    });

    try {
      const wrapper = mount(MiningPanel);
      await flushPromises();
      expect(wrapper.findAll('.tabular-nums').map((item) => item.text())).toEqual(['0', '1']);
      expect(translate).not.toHaveBeenCalled();
      const sync = wrapper.findAll('button').find((button) => button.text() === 'Sync to Anki')!;
      await sync.trigger('click');
      await flushPromises();
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'sync-anki',
        settings,
        translations: [{ headword: '먹다', korean: ['밥을 먹는 행동.'], english: ['The act of eating.'] }],
      });
      expect(wrapper.findAll('.tabular-nums').map((item) => item.text())).toEqual(['1', '0']);
      expect(wrapper.text()).toContain('1 created');
      expect(dismiss).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps Anki sync disabled before connection', () => {
    const wrapper = mount(MiningPanel);
    const syncButton = wrapper.findAll('button').find((button) => button.text() === 'Sync to Anki');

    expect(syncButton?.text()).toBe('Sync to Anki');
    expect(syncButton?.attributes('disabled')).toBeDefined();
  });
  it('filters stored entries and persists an edited definition', async () => {
    const entry = {
      headword: '먹다',
      originalForm: '먹어요',
      definitions: ['to eat'],
      koreanDefinitions: [],
      examples: [],
      contexts: [],
      status: 'known',
      createdAt: '2026-11-16T00:00:00.000Z',
      updatedAt: '2026-11-16T00:00:00.000Z',
    };
    sendMessage.mockImplementation(async (message) => {
      if (message.type === 'get-anki-settings') return { ok: true };
      if (message.type === 'edit-vocabulary') {
        return { ok: true, entries: [{ ...entry, definitions: message.definitions }] };
      }
      return { ok: true, entries: [entry] };
    });

    const wrapper = mount(VocabularyManager);
    await flushPromises();
    expect(wrapper.text()).toContain('to eat');

    await wrapper.get('select').setValue('unknown');
    expect(wrapper.text()).toContain('No matching words.');
    await wrapper.get('select').setValue('known');
    await wrapper.get('input[type="search"]').setValue('unknown term');
    expect(wrapper.text()).toContain('No matching words.');
    await wrapper.get('input[type="search"]').setValue('먹');

    await wrapper.findAll('button').find((button) => button.text() === 'Edit')!.trigger('click');
    await wrapper.get('textarea').setValue('consume');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'edit-vocabulary', headword: '먹다', definitions: ['consume'],
    });
    expect(wrapper.text()).toContain('consume');
  });

});
