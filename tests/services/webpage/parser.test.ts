import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectKoreanTextNodes,
  createWebpageParser,
  extractSentenceForWord,
  PAGE_STYLE_ID,
  PAGE_WORD_CLASS,
  PARSED_FRAGMENT_CLASS,
} from '@/services/webpage/parser';
import type { TokenizedSubtitleLine } from '@/types/messages';

const { tokenizeLines, sendMessage } = vi.hoisted(() => ({
  tokenizeLines: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock('@/services/korean/tokenize-client', () => ({ tokenizeLines }));
vi.mock('wxt/browser', () => ({
  browser: {
    runtime: { sendMessage },
  },
}));

describe('webpage Korean parser', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    tokenizeLines.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('collects visible Korean text nodes while skipping scripts, inputs, code, and non-Korean text', () => {
    document.body.innerHTML = `
      <article>
        <p>한국어 문장입니다.</p>
        <p>English only paragraph.</p>
        <script>const x = "스크립트";</script>
        <style>.a { content: "스타일"; }</style>
        <code>코드 텍스트</code>
        <textarea>입력 텍스트</textarea>
        <div contenteditable="true">편집 가능</div>
      </article>
    `;

    const nodes = collectKoreanTextNodes(document.body);
    expect(nodes.map((node) => node.nodeValue?.trim())).toEqual(['한국어 문장입니다.']);
  });

  it('extracts the sentence containing the clicked word', () => {
    const block = '첫 번째 문장입니다. 두 번째 문장에서 먹어요! 세 번째 문장.';
    expect(extractSentenceForWord(block, '먹어요')).toBe('두 번째 문장에서 먹어요!');
  });

  it('parses Korean text nodes, marks unknown words, handles clicks, updates known status, and restores original DOM on clear', async () => {
    document.body.innerHTML = '<p>오늘 밥을 먹어요.</p>';

    const tokenizedLine: TokenizedSubtitleLine = {
      text: '오늘 밥을 먹어요.',
      tokens: [
        {
          id: '0:0',
          text: '오늘',
          start: 0,
          length: 2,
          clickable: true,
          morphemes: [{ text: '오늘', tag: 'NNG', position: 0, length: 2 }],
        },
        { id: '0:2', text: ' ', start: 2, length: 1, clickable: false, morphemes: [] },
        {
          id: '0:3',
          text: '밥',
          start: 3,
          length: 1,
          clickable: true,
          morphemes: [{ text: '밥', tag: 'NNG', position: 3, length: 1 }],
        },
        { id: '0:4', text: '을 ', start: 4, length: 2, clickable: false, morphemes: [] },
        {
          id: '0:6',
          text: '먹어요',
          start: 6,
          length: 3,
          clickable: true,
          morphemes: [
            { text: '먹', tag: 'VV', position: 6, length: 1 },
            { text: '어요', tag: 'EF', position: 7, length: 2 },
          ],
        },
        { id: '0:9', text: '.', start: 9, length: 1, clickable: false, morphemes: [] },
      ],
    };
    tokenizeLines.mockResolvedValue([tokenizedLine]);

    const onSelectWord = vi.fn();
    const onClearSelection = vi.fn();
    const parser = createWebpageParser({ document, onSelectWord, onClearSelection });
    parser.setKnownHeadwords(new Set(['오늘']));

    const count = await parser.parse();
    expect(count).toBe(3);
    expect(parser.isParsed()).toBe(true);
    expect(document.getElementById(PAGE_STYLE_ID)).not.toBeNull();

    const words = Array.from(document.querySelectorAll<HTMLElement>(`.${PAGE_WORD_CLASS}`));
    expect(words.map((el) => [el.textContent, el.dataset.krUnknown])).toEqual([
      ['오늘', 'false'],
      ['밥', 'true'],
      ['먹어요', 'true'],
    ]);

    words[2]!.click();
    expect(onSelectWord).toHaveBeenCalledWith(expect.objectContaining({
      sentence: '오늘 밥을 먹어요.',
      element: words[2],
    }));

    parser.setKnownHeadwords(new Set(['오늘', '먹다']));
    expect(words[2]!.dataset.krUnknown).toBe('false');

    parser.clear();
    expect(parser.isParsed()).toBe(false);
    expect(document.querySelectorAll(`.${PARSED_FRAGMENT_CLASS}`)).toHaveLength(0);
    expect(document.getElementById(PAGE_STYLE_ID)).toBeNull();
    expect(document.body.querySelector('p')?.textContent).toBe('오늘 밥을 먹어요.');
    expect(onClearSelection).toHaveBeenCalled();
  });

  it('positions the page dictionary popup below words near the top of the viewport and above words lower down', async () => {
    const { createPagePopupHost } = await import('@/services/webpage/popup-host');
    sendMessage.mockResolvedValue({
      ok: true,
      entry: {
        headword: '오늘',
        originalForm: '오늘',
        definitions: ['today'],
        koreanDefinitions: [],
        examples: [],
      },
      savedContexts: [],
    });

    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    const topWord = document.createElement('span');
    topWord.textContent = '오늘';
    document.body.appendChild(topWord);
    vi.spyOn(topWord, 'getBoundingClientRect').mockReturnValue({
      top: 24,
      bottom: 44,
      left: 300,
      right: 340,
      width: 40,
      height: 20,
      x: 300,
      y: 24,
      toJSON: () => ({}),
    });

    const host = createPagePopupHost(document, vi.fn());
    await host.openForWord({
      token: {
        id: '0:0',
        text: '오늘',
        start: 0,
        length: 2,
        clickable: true,
        morphemes: [{ text: '오늘', tag: 'NNG', position: 0, length: 2 }],
      },
      element: topWord,
      sentence: '오늘 밥을 먹어요.',
    });

    const popupHost = document.getElementById('kr-page-popup-host');
    const popupEl = popupHost?.shadowRoot?.querySelector<HTMLElement>('.kr-dictionary-popup');
    expect(popupEl).not.toBeNull();
    expect(popupEl?.style.transform).toBe('translate(-50%, 0)');
    expect(popupEl?.style.top).toBe('54px');

    const bottomWord = document.createElement('span');
    bottomWord.textContent = '오늘';
    document.body.appendChild(bottomWord);
    vi.spyOn(bottomWord, 'getBoundingClientRect').mockReturnValue({
      top: 620,
      bottom: 640,
      left: 300,
      right: 340,
      width: 40,
      height: 20,
      x: 300,
      y: 620,
      toJSON: () => ({}),
    });

    await host.openForWord({
      token: {
        id: '0:0',
        text: '오늘',
        start: 0,
        length: 2,
        clickable: true,
        morphemes: [{ text: '오늘', tag: 'NNG', position: 0, length: 2 }],
      },
      element: bottomWord,
      sentence: '오늘 밥을 먹어요.',
    });

    expect(popupEl?.style.transform).toBe('translate(-50%, -100%)');
    expect(popupEl?.style.top).toBe('610px');

    host.destroy();
  });
});
