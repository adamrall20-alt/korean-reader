import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MiningPanel from '@/components/MiningPanel.vue';

const { sendMessage } = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      sendMessage,
    },
  },
}));

describe('MiningPanel', () => {
  beforeEach(() => {
    sendMessage.mockReset();
  });

  it('checks the background worker and displays the connected state', async () => {
    sendMessage.mockResolvedValue({ ok: true, version: '0.1.0' });

    const wrapper = mount(MiningPanel);
    await flushPromises();

    expect(sendMessage).toHaveBeenCalledWith({ type: 'ping' });
    expect(wrapper.get('[data-testid="connection-status"]').text()).toContain('Connected');
    expect(wrapper.text()).toContain('The background service worker is responding.');
    expect(wrapper.text()).toContain('v0.1.0');
  });

  it('shows an unavailable state when the background worker fails', async () => {
    sendMessage.mockRejectedValue(new Error('No receiving end'));

    const wrapper = mount(MiningPanel);
    await flushPromises();

    expect(wrapper.get('[data-testid="connection-status"]').text()).toContain('Unavailable');
    expect(wrapper.text()).toContain('The background service worker did not respond.');
  });

  it('shows an unavailable state when the background worker returns no response', async () => {
    sendMessage.mockResolvedValue(undefined);

    const wrapper = mount(MiningPanel);
    await flushPromises();

    expect(wrapper.get('[data-testid="connection-status"]').text()).toContain('Unavailable');
  });

  it('keeps Anki sync disabled until the feature is implemented', () => {
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
      if (message.type === 'ping') return { ok: true, version: '0.1.0' };
      if (message.type === 'edit-vocabulary') {
        return { ok: true, entries: [{ ...entry, definitions: message.definitions }] };
      }
      return { ok: true, entries: [entry] };
    });

    const wrapper = mount(MiningPanel);
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
