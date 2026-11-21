import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MiningPanel from '@/components/MiningPanel.vue';
import VocabularyManager from '@/components/VocabularyManager.vue';

const { sendMessage, queryTabs, sendToTab } = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  queryTabs: vi.fn(),
  sendToTab: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    tabs: { query: queryTabs, sendMessage: sendToTab },
    runtime: {
      sendMessage,
      getManifest: () => ({ version: '1.0.0' }),
    },
  },
}));

describe('MiningPanel', () => {
  beforeEach(() => {
    sendMessage.mockReset().mockResolvedValue(undefined);
  });

  it('shows mining controls and forwards known-word history to desktop', () => {
    const wrapper = mount(MiningPanel);
    expect(wrapper.text()).toContain('Open Sidebar');
    expect(wrapper.text()).toContain('Parse Page');
    expect(wrapper.find('[aria-label="Open Statistics"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Sync to Anki');
    expect(sendMessage).toHaveBeenCalledWith({ type: 'sync-desktop-history' });
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
