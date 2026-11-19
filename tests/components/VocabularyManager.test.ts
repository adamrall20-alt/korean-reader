import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VocabularyManager from '@/components/VocabularyManager.vue';
import type { VocabularyEntry } from '@/types/vocabulary';

const { sendMessage } = vi.hoisted(() => ({ sendMessage: vi.fn() }));
vi.mock('wxt/browser', () => ({ browser: { runtime: { sendMessage } } }));

const word = (index: number, status: 'known' | 'unknown' = 'known'): VocabularyEntry => ({
  headword: `단어${index}`,
  originalForm: `단어${index}`,
  definitions: [`meaning ${index}`],
  koreanDefinitions: [],
  examples: [],
  contexts: [],
  status,
  createdAt: new Date(Date.UTC(2026, 0, 1) + index * 60_000).toISOString(),
  updatedAt: '2026-11-16T00:00:00.000Z',
});

const headings = (wrapper: ReturnType<typeof mount>) => wrapper.findAll('h3').map((item) => item.text());
const moreButton = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('button').find((button) => /^Show \d+ more$/.test(button.text()));

describe('VocabularyManager with a large vocabulary', () => {
  let entries: VocabularyEntry[];

  beforeEach(() => {
    entries = Array.from({ length: 120 }, (_, index) => word(index, index % 2 ? 'unknown' : 'known'));
    sendMessage.mockImplementation(async (message) => {
      if (message.type === 'set-vocabulary-status') {
        entries = entries.map((entry) => entry.headword === message.headword ? { ...entry, status: message.status } : entry);
      }
      return { ok: true, entries };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    sendMessage.mockReset();
  });

  it('renders one page at a time and reveals more on request', async () => {
    const wrapper = mount(VocabularyManager);
    await flushPromises();
    expect(headings(wrapper)).toHaveLength(50);
    expect(headings(wrapper)[0]).toBe('단어119');
    expect(wrapper.text()).toContain('Showing 50 of 120 words');

    await moreButton(wrapper)!.trigger('click');
    expect(headings(wrapper)).toHaveLength(100);
    expect(moreButton(wrapper)!.text()).toBe('Show 20 more');
    await moreButton(wrapper)!.trigger('click');
    expect(headings(wrapper)).toHaveLength(120);
    expect(moreButton(wrapper)).toBeUndefined();
    expect(wrapper.text()).toContain('Showing 120 of 120 words');
  });

  it('keeps the revealed page after an edit and resets it when the filter changes', async () => {
    const wrapper = mount(VocabularyManager);
    await flushPromises();
    await moreButton(wrapper)!.trigger('click');
    const toggle = wrapper.get('[aria-label="Known status for 단어40"]');
    await toggle.trigger('click');
    await flushPromises();
    expect(headings(wrapper)).toHaveLength(100);
    expect(wrapper.get('[aria-label="Known status for 단어40"]').text()).toBe('Unknown');

    await wrapper.get('select').setValue('known');
    expect(headings(wrapper)).toHaveLength(50);
    expect(wrapper.text()).toContain('Showing 50 of 59 words');
    await wrapper.findAll('button').find((button) => button.text() === 'Newest first')!.trigger('click');
    expect(headings(wrapper)[0]).toBe('단어0');
  });

  it('applies search only after typing pauses', async () => {
    const wrapper = mount(VocabularyManager);
    await flushPromises();
    vi.useFakeTimers();
    const search = wrapper.get('input[type="search"]');

    await search.setValue('meaning 1');
    await search.setValue('meaning 11');
    await vi.advanceTimersByTimeAsync(200);
    expect(headings(wrapper)).toHaveLength(50);

    await search.setValue('meaning 117');
    await vi.advanceTimersByTimeAsync(200);
    expect(headings(wrapper)).toHaveLength(50);
    await vi.advanceTimersByTimeAsync(50);
    expect(headings(wrapper)).toEqual(['단어117']);
    expect(wrapper.text()).not.toContain('Showing');

    await search.setValue('없는 단어');
    await vi.advanceTimersByTimeAsync(250);
    expect(wrapper.text()).toContain('No matching words.');

    await search.setValue('');
    await vi.advanceTimersByTimeAsync(250);
    expect(headings(wrapper)).toHaveLength(50);
  });

  it('shows a load failure and recovers on reload', async () => {
    sendMessage.mockResolvedValueOnce({ ok: false, error: 'Could not access saved vocabulary.' });
    const wrapper = mount(VocabularyManager);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Could not access saved vocabulary.');
    expect(moreButton(wrapper)).toBeUndefined();

    await wrapper.findAll('button').find((button) => button.text() === 'Reload')!.trigger('click');
    await flushPromises();
    expect(headings(wrapper)).toHaveLength(50);
  });
});
