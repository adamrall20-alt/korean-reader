import { isKnownSubtitleWord, resolveRenderTokens } from '@/services/korean/dictionary-forms';
import { tokenizeLines } from '@/services/korean/tokenize-client';
import { hasJapaneseKana, hasJapaneseText, type ReaderLanguage } from '@/types/language';
import type { VocabularyContext } from '@/types/vocabulary';
import type { SubtitleToken } from '@/types/messages';

export const TOGGLE_PARSE_PAGE = 'kr-toggle-parse-page';
export const PAGE_STYLE_ID = 'kr-page-parser-style';
export const PARSED_FRAGMENT_CLASS = 'kr-parsed-fragment';
export const PAGE_WORD_CLASS = 'kr-page-word';
export const PAGE_WORD_SELECTED_CLASS = 'kr-page-word-selected';

const HANGUL_SYLLABLE_PATTERN = /[\uac00-\ud7a3]/;
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION',
  'CODE', 'PRE', 'SVG', 'MATH', 'IFRAME', 'CANVAS', 'VIDEO', 'AUDIO', 'HEAD', 'RT', 'RP',
]);
const BATCH_SIZE = 50;

export interface ParsedWordSelection {
  token: SubtitleToken;
  element: HTMLElement;
  sentence: string;
  language?: ReaderLanguage;
  focusSpan?: VocabularyContext['focusSpan'];
}

interface TrackedWord {
  element: HTMLElement;
  token: SubtitleToken;
}

export function extractSentenceForWord(blockText: string, word: string): string {
  const normalized = blockText.replace(/\s+/g, ' ').trim();
  if (!normalized) return word;
  const parts = normalized.split(/(?<=[.!?。！？])\s+|\r?\n/).map((part) => part.trim()).filter(Boolean);
  const match = parts.find((part) => part.includes(word));
  const sentence = match ?? normalized;
  return sentence.length > 300 ? `${sentence.slice(0, 297)}…` : sentence;
}

function isSkippableElement(element: Element | null): boolean {
  let current: Element | null = element;
  while (current) {
    if (SKIP_TAGS.has(current.tagName)) return true;
    if (current.classList.contains(PARSED_FRAGMENT_CLASS)) return true;
    if (current instanceof HTMLElement && (current.isContentEditable || current.getAttribute('contenteditable') === '' || current.getAttribute('contenteditable')?.toLowerCase() === 'true')) return true;
    if (current.id === 'kr-page-popup-host') return true;
    current = current.parentElement;
  }
  return false;
}

function japaneseSentence(node: Text, block: Element | null, token: SubtitleToken) {
  const doc = node.ownerDocument;
  let text = '';
  let focus = token.start;
  if (block) {
    const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode: (child) => child.parentElement?.closest('rt, rp, script, style') ?
        NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    for (let child = walker.nextNode(); child; child = walker.nextNode()) {
      if (child === node) focus += text.length;
      text += child.nodeValue ?? '';
    }
  } else text = node.data;
  const spanEnd = focus + token.length;
  const previous = text.slice(0, focus).search(/[^。！？!?\n]*$/u);
  const following = text.slice(spanEnd).search(/[。！？!?\n]/u);
  const start = Math.max(previous, focus - 145);
  const end = following < 0 ? Math.min(text.length, spanEnd + 145) : Math.min(spanEnd + following + 1, spanEnd + 145);
  const raw = text.slice(start, end);
  return { sentence: raw.trim(), focusSpan: { start: focus - start - (raw.length - raw.trimStart().length), length: token.length } };
}

export function collectKoreanTextNodes(root: Node): Text[] {
  return collectTextNodes(root, 'ko');
}

export function collectTextNodes(root: Node, language: ReaderLanguage): Text[] {
  const nodes: Text[] = [];
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    const textNode = current as Text;
    const value = textNode.nodeValue ?? '';
    const tag = textNode.parentElement?.closest('[lang]')?.getAttribute('lang')?.toLowerCase().split('-')[0];
    const rubyReading = textNode.parentElement?.closest('ruby')?.querySelector('rt')?.textContent;
    const matches = language === 'ko' ? HANGUL_SYLLABLE_PATTERN.test(value)
      : tag === 'ja' ? hasJapaneseText(value) : (!tag || !['zh', 'ko'].includes(tag)) &&
        (hasJapaneseKana(value) || (!!rubyReading && hasJapaneseKana(rubyReading) && hasJapaneseText(value)));
    if (matches && !isSkippableElement(textNode.parentElement)) {
      nodes.push(textNode);
    }
    current = walker.nextNode();
  }
  return nodes;
}

export function injectPageStyles(doc: Document, underlineColor = '#f87171'): void {
  let style = doc.getElementById(PAGE_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = PAGE_STYLE_ID;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
  style.textContent = [
    `.${PAGE_WORD_CLASS} { cursor: pointer; border-radius: 0.16em; transition: background-color 120ms ease; }`,
    `.${PAGE_WORD_CLASS}[data-kr-unknown="true"] { text-decoration-line: underline; text-decoration-color: ${underlineColor}; text-decoration-thickness: 0.09em; text-underline-offset: 0.16em; }`,
    `.${PAGE_WORD_CLASS}:hover, .${PAGE_WORD_SELECTED_CLASS} { background-color: rgba(22, 163, 74, 0.24); }`,
  ].join('\n');
}

export function removePageStyles(doc: Document): void {
  doc.getElementById(PAGE_STYLE_ID)?.remove();
}

export function createWebpageParser(options: {
  document: Document;
  onSelectWord: (selection: ParsedWordSelection) => void;
  onClearSelection: () => void;
}) {
  const { document: doc, onSelectWord, onClearSelection } = options;
  let parsed = false;
  let knownHeadwords = new Set<string>();
  let underlineColor = '#f87171';
  let trackedWords: TrackedWord[] = [];
  const originals = new Map<HTMLElement, Text>();
  let selectedElement: HTMLElement | null = null;
  let generation = 0;

  function updateUnknownStates() {
    for (const { element, token } of trackedWords) {
      element.dataset.krUnknown = isKnownSubtitleWord(token, knownHeadwords) ? 'false' : 'true';
    }
  }

  function clearSelected() {
    selectedElement?.classList.remove(PAGE_WORD_SELECTED_CLASS);
    selectedElement = null;
  }

  function clear() {
    generation += 1;
    clearSelected();
    onClearSelection();
    for (const [fragment, original] of originals) fragment.replaceWith(original);
    originals.clear();
    trackedWords = [];
    removePageStyles(doc);
    parsed = false;
  }

  async function parse(language: ReaderLanguage = 'ko'): Promise<number> {
    if (parsed) return trackedWords.length;
    const currentGeneration = ++generation;
    parsed = true;
    injectPageStyles(doc, underlineColor);

    const textNodes = collectTextNodes(doc.body ?? doc.documentElement, language);
    for (let index = 0; index < textNodes.length; index += BATCH_SIZE) {
      if (currentGeneration !== generation) return 0;
      const batch = textNodes.slice(index, index + BATCH_SIZE).filter((node) => node.isConnected);
      if (!batch.length) continue;

      const texts = batch.map((node) => node.nodeValue ?? '');
      const tokenized = await tokenizeLines(texts, language);
      if (currentGeneration !== generation) return 0;

      for (let itemIndex = 0; itemIndex < batch.length; itemIndex += 1) {
        const node = batch[itemIndex]!;
        const line = tokenized[itemIndex];
        if (!node.isConnected || !line) continue;

        const originalText = node.nodeValue ?? '';
        const parentBlock = node.parentElement?.closest('p, li, td, th, blockquote, h1, h2, h3, h4, h5, h6, div, article, section') ?? node.parentElement;
        const blockText = parentBlock?.textContent ?? originalText;

        const fragment = doc.createElement('span');
        fragment.className = PARSED_FRAGMENT_CLASS;
        fragment.setAttribute('data-kr-original', originalText);

        if (!line.tokens.some((token) => token.clickable)) continue;
        const renderTokens = resolveRenderTokens(line.tokens, knownHeadwords);
        for (const token of renderTokens) {
          if (!token.clickable) {
            fragment.appendChild(doc.createTextNode(token.text));
            continue;
          }
          const span = doc.createElement('span');
          span.className = PAGE_WORD_CLASS;
          if (language === 'ja') span.lang = 'ja';
          const context = language === 'ja' ? japaneseSentence(node, parentBlock, token)
            : { sentence: extractSentenceForWord(blockText, token.text) };
          span.textContent = token.text;
          span.dataset.krUnknown = isKnownSubtitleWord(token, knownHeadwords) ? 'false' : 'true';
          span.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            clearSelected();
            selectedElement = span;
            span.classList.add(PAGE_WORD_SELECTED_CLASS);
            onSelectWord({
              token,
              element: span,
              ...context,
              ...(language === 'ja' ? { language } : {}),
            });
          });
          trackedWords.push({ element: span, token });
          fragment.appendChild(span);
        }

        originals.set(fragment, node);
        node.replaceWith(fragment);
      }
    }
    return trackedWords.length;
  }

  return {
    isParsed: () => parsed,
    parse,
    clear,
    clearSelected,
    setKnownHeadwords(headwords: ReadonlySet<string>) {
      knownHeadwords = new Set(headwords);
      if (parsed) updateUnknownStates();
    },
    setUnderlineColor(color: string) {
      underlineColor = color;
      if (parsed) injectPageStyles(doc, underlineColor);
    },
  };
}
