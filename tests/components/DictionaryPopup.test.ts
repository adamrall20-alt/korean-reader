import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DictionaryPopup from '@/components/DictionaryPopup.vue';

const { sendMessage } = vi.hoisted(() => ({ sendMessage: vi.fn() }));
vi.mock('wxt/browser', () => ({ browser: { runtime: { sendMessage } } }));

const entry = {
  headword: '장난하다',
  originalForm: '장난하지',
  definitions: [],
  koreanDefinitions: ['재미로 하는 짓을 하다.'],
  examples: ['친구와 장난하다.'],
};

const props = { entry, originalForm: entry.originalForm, loading: false, error: null, style: {} };

describe('DictionaryPopup translation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('translates only the Korean definition after an explicit click', async () => {
    const translate = vi.fn().mockResolvedValue('To do something for fun.');
    const destroy = vi.fn();
    const create = vi.fn().mockResolvedValue({ translate, destroy });
    vi.stubGlobal('Translator', { create });
    const wrapper = mount(DictionaryPopup, { props });
    expect(create).not.toHaveBeenCalled();

    await wrapper.get('.kr-translate-button').trigger('click');
    await flushPromises();

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      sourceLanguage: 'ko',
      targetLanguage: 'en',
    }));
    expect(translate).toHaveBeenCalledExactlyOnceWith(entry.koreanDefinitions[0], {
      signal: expect.any(AbortSignal),
    });
    expect(destroy).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Machine translation');
    expect(wrapper.text()).toContain('To do something for fun.');
    expect(wrapper.text()).toContain(entry.koreanDefinitions[0]);
    await wrapper.setProps({ entry: { ...entry, definitions: ['to play'] } });
    expect(wrapper.text()).not.toContain('Machine translation');
    expect(wrapper.find('.kr-translate-button').exists()).toBe(false);
  });

  it('keeps the Korean definition and allows a retry when Chrome fails', async () => {
    vi.stubGlobal('Translator', { create: vi.fn().mockRejectedValue(new Error('Unavailable')) });
    const wrapper = mount(DictionaryPopup, { props });
    await wrapper.get('.kr-translate-button').trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="status"]').text()).toContain('could not translate');
    expect(wrapper.text()).toContain(entry.koreanDefinitions[0]);
    expect(wrapper.get('.kr-translate-button').attributes('disabled')).toBeUndefined();
  });
});

describe('DictionaryPopup mining', () => {
  const miningContext = {
    sentence: '아이들이 장난하지.',
    originalForm: entry.originalForm,
    sourceUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
    sourceTitle: 'Video',
    timestamp: 12.5,
  };

  it('explains an already known headword without indicating ongoing work', () => {
    const wrapper = mount(DictionaryPopup, { props: { ...props, isKnown: true } });
    const button = wrapper.get('.kr-known-button');
    expect(button.text()).toBe('✓ Known');
    expect(button.attributes('aria-busy')).toBe('false');
    expect(button.attributes('title')).toBe(`${entry.headword} is already known`);
    expect(button.attributes('disabled')).toBeDefined();
  });

  it('marks the dictionary headword known without selecting definitions or recording audio', async () => {
    sendMessage.mockReset()
      .mockRejectedValueOnce(new Error('Storage unavailable'))
      .mockResolvedValueOnce({ ok: true });
    const recordAudio = vi.fn();
    const wrapper = mount(DictionaryPopup, { props: {
      ...props,
      entry: { ...entry, definitions: ['to play', 'to joke'] },
      miningContext,
      recordAudio,
    } });
    const known = wrapper.get('.kr-known-button');
    const mine = wrapper.get('.kr-mine-button:not(.kr-known-button)');
    expect(known.text()).toBe('Known');
    expect(known.classes()).toContain('kr-mine-button');
    expect(mine.element.nextElementSibling).toBe(known.element);
    expect(mine.attributes('disabled')).toBeDefined();
    expect(sendMessage).not.toHaveBeenCalled();

    await known.trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Try again');
    await known.trigger('click');
    await flushPromises();

    expect(sendMessage.mock.calls).toEqual([
      [{ type: 'mark-word-known', headword: entry.headword }],
      [{ type: 'mark-word-known', headword: entry.headword }],
    ]);
    expect(recordAudio).not.toHaveBeenCalled();
    expect(known.attributes('aria-pressed')).toBe('true');
    expect(known.attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Marked as known.');
    expect(wrapper.get('[role="status"] .kr-word-sparkle').attributes('aria-hidden')).toBe('true');
    await wrapper.setProps({ isKnown: true });
    await wrapper.setProps({ isKnown: false });
    expect(known.attributes('disabled')).toBeUndefined();
  });

  it('requires an explicit mine action, reports a failed save, and lets the user retry', async () => {
    sendMessage.mockReset()
      .mockResolvedValueOnce({ ok: false, error: 'Storage unavailable' })
      .mockResolvedValueOnce({ ok: true, outcome: 'mined' });
    const wrapper = mount(DictionaryPopup, { props: { ...props, miningContext } });
    expect(sendMessage).not.toHaveBeenCalled();

    await wrapper.get('.kr-mine-button:not(.kr-known-button)').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Storage unavailable');
    await wrapper.get('.kr-mine-button:not(.kr-known-button)').trigger('click');
    await flushPromises();

    expect(sendMessage).toHaveBeenLastCalledWith({
      type: 'mine-word',
      entry,
      context: miningContext,
      machineDefinitions: [],
    });
    expect(wrapper.text()).toContain('✓ Mined');
    expect(wrapper.get('[role="status"] .kr-word-sparkle').attributes('aria-hidden')).toBe('true');
    expect(wrapper.find('.kr-mine-button:not(.kr-known-button)').exists()).toBe(false);
  });

  it('mines only selected definitions and resets selection for another entry', async () => {
    sendMessage.mockReset().mockResolvedValue({ ok: true, outcome: 'mined' });
    const multi = { ...entry, definitions: ['first', 'second', 'third'], koreanDefinitions: ['unrelated'] };
    const wrapper = mount(DictionaryPopup, { props: { ...props, entry: multi, miningContext } });
    expect(wrapper.get('.kr-mine-button:not(.kr-known-button)').attributes('disabled')).toBeDefined();
    const choices = wrapper.findAll('.kr-definition-button');
    await choices[0]!.trigger('click');
    await choices[1]!.trigger('click');
    await choices[0]!.trigger('click');
    expect(choices[0]!.attributes('aria-pressed')).toBe('false');
    expect(choices[1]!.attributes('aria-pressed')).toBe('true');
    await wrapper.get('.kr-mine-button:not(.kr-known-button)').trigger('click');
    await flushPromises();
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      entry: expect.objectContaining({ definitions: ['second'], koreanDefinitions: [] }),
    }));
    await wrapper.setProps({ entry: { ...multi, headword: '다른', definitions: ['one', 'two'] }, miningContext: { ...miningContext } });
    expect(wrapper.get('.kr-mine-button:not(.kr-known-button)').attributes('disabled')).toBeDefined();
  });

  it('keeps selected Korean definitions paired with their translations', async () => {
    vi.stubGlobal('Translator', { create: vi.fn().mockResolvedValue({
      translate: vi.fn().mockResolvedValueOnce('first translation').mockResolvedValueOnce('second translation'),
      destroy: vi.fn(),
    }) });
    sendMessage.mockReset().mockResolvedValue({ ok: true, outcome: 'mined' });
    const wrapper = mount(DictionaryPopup, { props: { ...props, entry: { ...entry, koreanDefinitions: ['첫째', '둘째'] }, miningContext } });
    await wrapper.get('.kr-translate-button').trigger('click');
    await flushPromises();
    await wrapper.findAll('.kr-definition-button')[3]!.trigger('click');
    await wrapper.get('.kr-mine-button:not(.kr-known-button)').trigger('click');
    await flushPromises();
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      entry: expect.objectContaining({ koreanDefinitions: ['둘째'] }),
      machineDefinitions: ['second translation'],
    }));
    vi.unstubAllGlobals();
  });

  it('records on the mine click and saves the audio with the selected sentence', async () => {
    const audio = 'data:audio/webm;base64,YWJj';
    const recordAudio = vi.fn().mockResolvedValue(audio);
    sendMessage.mockReset().mockResolvedValue({ ok: true, outcome: 'mined' });
    const wrapper = mount(DictionaryPopup, { props: { ...props, miningContext, recordAudio } });
    expect(recordAudio).not.toHaveBeenCalled();

    await wrapper.get('.kr-mine-button:not(.kr-known-button)').trigger('click');
    await flushPromises();

    expect(recordAudio).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith({
      type: 'mine-word', entry, context: { ...miningContext, audio }, machineDefinitions: [],
    });
    expect(wrapper.text()).toContain('✓ Mined');
  });

  it('saves the sentence when capture fails and offers audio on an existing sentence', async () => {
    const recordAudio = vi.fn().mockRejectedValue(new Error('No audio track'));
    sendMessage.mockReset().mockResolvedValue({ ok: true, outcome: 'mined' });
    const wrapper = mount(DictionaryPopup, { props: { ...props, miningContext, recordAudio } });

    await wrapper.get('.kr-mine-button:not(.kr-known-button)').trigger('click');
    await flushPromises();
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith({
      type: 'mine-word', entry, context: miningContext, machineDefinitions: [],
    });
    expect(wrapper.text()).toContain('Subtitle audio unavailable.');

    const existing = mount(DictionaryPopup, {
      props: { ...props, miningContext, recordAudio, savedContexts: [miningContext] },
    });
    expect(existing.get('.kr-mine-button:not(.kr-known-button)').text()).toBe('Add Audio');
    recordAudio.mockResolvedValue('data:audio/webm;base64,YWJj');
    sendMessage.mockResolvedValue({ ok: true, outcome: 'audio-added' });
    await existing.get('.kr-mine-button:not(.kr-known-button)').trigger('click');
    await flushPromises();
    expect(existing.text()).toContain('✓ Audio saved');
  });

  it('distinguishes an existing context from a new sentence for the same word', async () => {
    const wrapper = mount(DictionaryPopup, {
      props: { ...props, miningContext, savedContexts: [miningContext] },
    });
    expect(wrapper.text()).toContain('Already mined · Sentence saved');
    expect(wrapper.find('.kr-mine-button:not(.kr-known-button)').exists()).toBe(false);

    await wrapper.setProps({ miningContext: { ...miningContext, sentence: '친구와 장난하지.' } });
    expect(wrapper.get('.kr-mine-button:not(.kr-known-button)').text()).toBe('Save Sentence');
  });
});
