import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import SubtitleReader from '@/components/SubtitleReader.vue';
import type { LookupResponse, TokenizedSubtitleLine } from '@/types/messages';

const { sendMessage } = vi.hoisted(() => ({
  sendMessage: vi.fn<() => Promise<LookupResponse | undefined>>(),
}));

vi.mock('wxt/browser', () => ({
  browser: { runtime: { sendMessage } },
}));

const lines: TokenizedSubtitleLine[] = [
  {
    text: '안녕하세요',
    tokens: [
      {
        id: '0:0',
        text: '안녕하세요',
        start: 0,
        length: 5,
        clickable: true,
        morphemes: [],
      },
    ],
  },
  {
    text: '반갑습니다',
    tokens: [
      {
        id: '1:0',
        text: '반갑습니다',
        start: 0,
        length: 5,
        clickable: true,
        morphemes: [],
      },
    ],
  },
];

describe('SubtitleReader', () => {
  it('renders each visible subtitle line as clickable words', async () => {
    const wrapper = mount(SubtitleReader, {
      props: {
        lines,
        visible: true,
      },
    });

    expect(wrapper.findAll('.kr-subtitle-line')).toHaveLength(2);
    expect(wrapper.text()).toContain('안녕하세요');
    expect(wrapper.text()).toContain('반갑습니다');
    expect(wrapper.get('[role="region"]').attributes('lang')).toBe('ko');

    const firstWord = wrapper.get('button');
    await firstWord.trigger('click');
    expect(firstWord.classes()).toContain('kr-word-token-selected');
  });

  it('pauses the YouTube video when a word is clicked', async () => {
    const video = document.createElement('video');
    video.className = 'html5-main-video';
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => undefined);
    document.body.append(video);

    const wrapper = mount(SubtitleReader, {
      props: {
        lines: [lines[0]!],
        visible: true,
      },
    });

    await wrapper.get('button').trigger('click');

    expect(pause).toHaveBeenCalledOnce();
    wrapper.unmount();
    video.remove();
  });

  it('only shows English definitions and ignores an older lookup result', async () => {
    let resolveFirst!: (response: LookupResponse) => void;
    sendMessage.mockReset();
    sendMessage.mockImplementationOnce(() => new Promise((resolve) => {
      resolveFirst = resolve;
    }));
    sendMessage.mockResolvedValueOnce({
      ok: true,
      entry: {
        headword: '반갑다',
        originalForm: '반갑습니다',
        definitions: ['glad to meet', 'pleased', 'happy', 'fourth definition'],
        koreanDefinitions: ['기쁘다'],
        examples: [],
      },
    });

    const wrapper = mount(SubtitleReader, { props: { lines, visible: true } });
    const [first, second] = wrapper.findAll('button');
    await first!.trigger('mouseenter');
    expect(sendMessage).not.toHaveBeenCalled();
    await first!.trigger('click');
    await second!.trigger('click');
    await flushPromises();

    resolveFirst({ ok: false, error: 'Outdated lookup error' });
    await flushPromises();

    const popup = wrapper.get('[role="dialog"]');
    expect(popup.text()).toContain('반갑다');
    expect(popup.findAll('li').map((item) => item.text())).toEqual([
      'glad to meet', 'pleased', 'happy', 'fourth definition',
    ]);
    expect(popup.text()).not.toContain('기쁘다');
    expect(popup.text()).not.toContain('Outdated lookup error');
  });

  it('shows the Korean definition separately from examples when English is unavailable', async () => {
    sendMessage.mockResolvedValueOnce({
      ok: true,
      entry: {
        headword: '반갑다',
        originalForm: '반갑습니다',
        definitions: [],
        koreanDefinitions: ['기쁘다'],
        examples: ['만나서 반갑다.'],
      },
    });
    const wrapper = mount(SubtitleReader, { props: { lines, visible: true } });
    await wrapper.findAll('button')[1]!.trigger('click');
    await flushPromises();

    expect(wrapper.get('.kr-dictionary-definitions').text()).toBe('기쁘다');
    expect(wrapper.get('.kr-dictionary-examples').text()).toContain('만나서 반갑다.');
  });

  it('underlines unknown words and updates conjugated and particle forms in place', async () => {
    const inflected: TokenizedSubtitleLine[] = [{
      text: '밥을 먹어요.',
      tokens: [
        {
          id: '0:0', text: '밥을', start: 0, length: 2, clickable: true,
          morphemes: [
            { text: '밥', tag: 'NNG', position: 0, length: 1 },
            { text: '을', tag: 'JKO', position: 1, length: 1 },
          ],
        },
        { id: '0:2', text: ' ', start: 2, length: 1, clickable: false, morphemes: [] },
        {
          id: '0:3', text: '먹어요', start: 3, length: 3, clickable: true,
          morphemes: [
            { text: '먹', tag: 'VV', position: 3, length: 1 },
            { text: '어요', tag: 'EF', position: 4, length: 2 },
          ],
        },
        { id: '0:6', text: '.', start: 6, length: 1, clickable: false, morphemes: [] },
      ],
    }];
    const wrapper = mount(SubtitleReader, { props: { lines: inflected, visible: true } });

    expect(wrapper.findAll('.kr-word-token-unknown').map((word) => word.text())).toEqual(['밥을', '먹어요']);
    await wrapper.setProps({ knownHeadwords: new Set(['밥', '먹다']) });
    expect(wrapper.findAll('.kr-word-token-unknown')).toHaveLength(0);
    await wrapper.setProps({ knownHeadwords: new Set(['밥']) });
    expect(wrapper.get('.kr-word-token-unknown').text()).toBe('먹어요');
  });

  it('matches a known pronoun with a plural suffix and particle', async () => {
    const wrapper = mount(SubtitleReader, { props: {
      visible: true,
      knownHeadwords: new Set(['여러분']),
      lines: [{
        text: '여러분들의',
        tokens: [{
          id: '0:0', text: '여러분들의', start: 0, length: 5, clickable: true,
          morphemes: [
            { text: '여러분', tag: 'NP', position: 0, length: 3 },
            { text: '들', tag: 'XSN', position: 3, length: 1 },
            { text: '의', tag: 'JKG', position: 4, length: 1 },
          ],
        }],
      }],
    } });
    expect(wrapper.find('.kr-word-token-unknown').exists()).toBe(false);
    await wrapper.setProps({ knownHeadwords: new Set(['여러']) });
    expect(wrapper.get('.kr-word-token-unknown').text()).toBe('여러분들의');
  });

  it('keeps a noun plus a known copula underlined until the noun is known', async () => {
    const wrapper = mount(SubtitleReader, { props: {
      visible: true,
      knownHeadwords: new Set(['이다']),
      lines: [{
        text: '학생이에요',
        tokens: [{
          id: '0:0', text: '학생이에요', start: 0, length: 5, clickable: true,
          morphemes: [
            { text: '학생', tag: 'NNG', position: 0, length: 2 },
            { text: '이', tag: 'VCP', position: 2, length: 1 },
            { text: '에요', tag: 'EF', position: 3, length: 2 },
          ],
        }],
      }],
    } });

    expect(wrapper.get('.kr-word-token-unknown').text()).toBe('학생이에요');
    await wrapper.setProps({ knownHeadwords: new Set(['이다', '학생']) });
    expect(wrapper.find('.kr-word-token-unknown').exists()).toBe(false);
  });

  it('renders nothing when hidden', () => {
    const wrapper = mount(SubtitleReader, {
      props: {
        lines: [lines[0]!],
        visible: false,
      },
    });

    expect(wrapper.find('.kr-subtitles').exists()).toBe(false);
  });

  it('renders nothing when there are no lines', () => {
    const wrapper = mount(SubtitleReader, {
      props: {
        lines: [],
        visible: true,
      },
    });

    expect(wrapper.find('.kr-subtitles').exists()).toBe(false);
  });

  it('splits multi-word constructions and underlines only unknown sub-words without underlining particles', async () => {
    const wrapper = mount(SubtitleReader, {
      props: {
        visible: true,
        knownHeadwords: new Set(['먹다', '학생']),
        lines: [
          {
            text: '먹어봤어요',
            tokens: [
              {
                id: '0:0',
                text: '먹어',
                start: 0,
                length: 2,
                clickable: true,
                morphemes: [
                  { text: '먹', tag: 'VV', position: 0, length: 1 },
                  { text: '어', tag: 'EC', position: 1, length: 1 },
                ],
              },
              {
                id: '0:2',
                text: '봤어요',
                start: 2,
                length: 3,
                clickable: true,
                morphemes: [
                  { text: '보', tag: 'VX', position: 2, length: 1 },
                  { text: '었', tag: 'EP', position: 2, length: 1 },
                  { text: '어요', tag: 'EF', position: 3, length: 2 },
                ],
              },
            ],
          },
          {
            text: '학생들이에요',
            tokens: [
              {
                id: '1:0',
                text: '학생',
                start: 0,
                length: 2,
                clickable: true,
                morphemes: [{ text: '학생', tag: 'NNG', position: 0, length: 2 }],
              },
              { id: '1:2', text: '들', start: 2, length: 1, clickable: false, morphemes: [] },
              {
                id: '1:3',
                text: '이에요',
                start: 3,
                length: 3,
                clickable: true,
                morphemes: [
                  { text: '이', tag: 'VCP', position: 3, length: 1 },
                  { text: '에요', tag: 'EF', position: 4, length: 2 },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(wrapper.findAll('.kr-word-token-unknown').map((node) => node.text())).toEqual(['봤어요', '이에요']);
    expect(wrapper.findAll('.kr-word-token').map((node) => node.text())).toEqual(['먹어', '봤어요', '학생', '이에요']);

    await wrapper.setProps({ knownHeadwords: new Set(['먹다', '보다', '학생', '이다']) });
    expect(wrapper.findAll('.kr-word-token-unknown')).toHaveLength(0);
  });

  it('renders unspaced compounds whole when known as a whole and split when only parts are checked', async () => {
    const compoundLines: TokenizedSubtitleLine[] = [{
      text: '한국어공부',
      tokens: [{
        id: '0:0',
        text: '한국어공부',
        start: 0,
        length: 5,
        clickable: true,
        morphemes: [
          { text: '한국어', tag: 'NNP', position: 0, length: 3 },
          { text: '공부', tag: 'NNG', position: 3, length: 2 },
        ],
        parts: [
          {
            id: '0:0:3',
            text: '한국어',
            start: 0,
            length: 3,
            clickable: true,
            morphemes: [{ text: '한국어', tag: 'NNP', position: 0, length: 3 }],
          },
          {
            id: '0:3:2',
            text: '공부',
            start: 3,
            length: 2,
            clickable: true,
            morphemes: [{ text: '공부', tag: 'NNG', position: 3, length: 2 }],
          },
        ],
      }],
    }];

    const wrapper = mount(SubtitleReader, {
      props: {
        lines: compoundLines,
        visible: true,
        knownHeadwords: new Set(['한국어']),
      },
    });

    expect(wrapper.findAll('.kr-word-token').map((node) => node.text())).toEqual(['한국어', '공부']);
    expect(wrapper.findAll('.kr-word-token-unknown').map((node) => node.text())).toEqual(['공부']);

    await wrapper.setProps({ knownHeadwords: new Set(['한국어공부']) });
    expect(wrapper.findAll('.kr-word-token').map((node) => node.text())).toEqual(['한국어공부']);
    expect(wrapper.findAll('.kr-word-token-unknown')).toHaveLength(0);
  });

  it('matches colloquial contraction aliases for both underlining and popup Known state', async () => {
    sendMessage.mockReset();
    sendMessage.mockResolvedValueOnce({
      ok: true,
      entry: {
        headword: '이거',
        originalForm: '이거',
        definitions: ['this thing'],
        koreanDefinitions: [],
        examples: [],
      },
    });

    const wrapper = mount(SubtitleReader, {
      props: {
        visible: true,
        knownHeadwords: new Set(['이것']),
        lines: [{
          text: '이거',
          tokens: [{
            id: '0:0',
            text: '이거',
            start: 0,
            length: 2,
            clickable: true,
            morphemes: [{ text: '이거', tag: 'NP', position: 0, length: 2 }],
          }],
        }],
      },
    });

    expect(wrapper.find('.kr-word-token-unknown').exists()).toBe(false);
    await wrapper.get('.kr-word-token').trigger('click');
    await flushPromises();
    expect(wrapper.get('.kr-known-button').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.kr-known-button').text()).toBe('✓ Known');
  });
});
