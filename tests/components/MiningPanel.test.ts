import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ANKI_DEFAULT_FIELDS, DEFAULT_ANKI_SETTINGS } from '@/types/anki';
import { VOCABULARY_REVISION_KEY } from '@/types/vocabulary';
import MiningPanel from '@/components/MiningPanel.vue';
import VocabularyManager from '@/components/VocabularyManager.vue';

const { sendMessage, addStorageListener, removeStorageListener, queryTabs, sendToTab } = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  addStorageListener: vi.fn(),
  removeStorageListener: vi.fn(),
  queryTabs: vi.fn(),
  sendToTab: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    tabs: { query: queryTabs, sendMessage: sendToTab },
    storage: { onChanged: { addListener: addStorageListener, removeListener: removeStorageListener } },
    runtime: {
      sendMessage,
      getManifest: () => ({ version: '1.0.0' }),
    },
  },
}));

describe('MiningPanel', () => {
  beforeEach(() => {
    sendMessage.mockReset();
    addStorageListener.mockClear();
    removeStorageListener.mockClear();
  });

  it('shows counters and keeps management and configuration out of the popup', () => {
    const wrapper = mount(MiningPanel);
    expect(wrapper.text()).toContain('Known words');
    expect(wrapper.text()).toContain('Pending sync');
    expect(wrapper.text()).not.toContain('Manage vocabulary');
    expect(wrapper.text()).not.toContain('Connection settings');
  });

  it('puts language and page actions before the separate Anki controls in keyboard order', () => {
    const wrapper = mount(MiningPanel);
    const reading = wrapper.get('[role="region"][aria-labelledby="toolbar-reading-title"]');
    expect(reading.get('label').text()).toContain('Reading language');
    expect(reading.findAll('button').map((button) => button.text())).toEqual(['Open Sidebar', 'Parse Page']);
    const anki = wrapper.get('[role="region"][aria-labelledby="toolbar-anki-title"]');
    expect(anki.findAll('button').map((button) => button.text())).toEqual(['Connect Anki', 'Sync to Anki']);
    expect(reading.element.compareDocumentPosition(anki.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    wrapper.unmount();
  });

  it('opens the transcript in the active tab and reports an unsupported page', async () => {
    queryTabs.mockResolvedValue([{ id: 42 }]);
    sendToTab.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    try {
      const wrapper = mount(MiningPanel);
      const button = wrapper.findAll('button').find((item) => item.text() === 'Open Sidebar')!;
      await button.trigger('click');
      await flushPromises();
      expect(wrapper.text()).toContain('Open or refresh a YouTube video');
      expect(close).not.toHaveBeenCalled();
      await button.trigger('click');
      await flushPromises();
      expect(queryTabs).toHaveBeenCalledWith({ active: true, currentWindow: true });
      expect(sendToTab).toHaveBeenCalledWith(42, { type: 'open-transcript' });
      expect(close).toHaveBeenCalledOnce();
    } finally {
      close.mockRestore();
    }
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
        case 'get-vocabulary-summary': return { ok: true, summary: { knownCount: 2, minedEntries: [entry] } };
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
      expect(wrapper.findAll('.tabular-nums').map((item) => item.text())).toEqual(['2', '1']);
      expect(translate).not.toHaveBeenCalled();
      const sync = wrapper.findAll('button').find((button) => button.text() === 'Sync to Anki')!;
      await sync.trigger('click');
      await flushPromises();
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'sync-anki',
        settings,
        translations: [{ headword: '먹다', korean: ['밥을 먹는 행동.'], english: ['The act of eating.'] }],
      });
      expect(wrapper.findAll('.tabular-nums').map((item) => item.text())).toEqual(['2', '0']);
      expect(wrapper.text()).toContain('1 created');
      expect(dismiss).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('refreshes the known count after a large import with Anki disconnected', async () => {
    let knownCount = 0;
    sendMessage.mockImplementation(async (message) => message.type === 'get-vocabulary-summary'
      ? { ok: true, summary: { knownCount, minedEntries: [] } }
      : { ok: true, settings: DEFAULT_ANKI_SETTINGS });
    const wrapper = mount(MiningPanel);
    await flushPromises();
    const counts = () => wrapper.findAll('.tabular-nums').map((item) => item.text());
    expect(counts()).toEqual(['0', '—']);

    knownCount = 6000;
    const listener = addStorageListener.mock.calls[0]![0];
    listener({ [VOCABULARY_REVISION_KEY]: { newValue: 'imported' } }, 'local');
    await flushPromises();
    expect(counts()).toEqual([(6000).toLocaleString(), '—']);
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'count-unsynced' }));
    expect(wrapper.findAll('button').find((button) => button.text() === 'Sync to Anki')?.attributes('disabled'))
      .toBeDefined();

    wrapper.unmount();
    expect(removeStorageListener).toHaveBeenCalledWith(listener);
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
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(wrapper.text()).toContain('No matching words.');
    await wrapper.get('input[type="search"]').setValue('먹');
    await new Promise((resolve) => setTimeout(resolve, 300));

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
