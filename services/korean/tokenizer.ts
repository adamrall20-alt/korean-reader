import type { TokenInfo } from 'kiwi-nlp';
import type {
  KoreanMorpheme,
  SubtitleToken,
  TokenizedSubtitleLine,
} from '@/types/messages';

const HANGUL_PATTERN = /[\u1100-\u11ff\u3131-\u318e\uac00-\ud7a3]/u;
const NON_WORD_TAGS = new Set(['SF', 'SE', 'SS', 'SP', 'SO', 'SW']);

function isClickableMorpheme(token: TokenInfo): boolean {
  return HANGUL_PATTERN.test(token.str) && !NON_WORD_TAGS.has(token.tag);
}

function toMorpheme(token: TokenInfo): KoreanMorpheme {
  return {
    text: token.str,
    tag: token.tag,
    position: token.position,
    length: token.length,
  };
}

export function tokenizeSubtitleLine(
  line: string,
  morphemes: TokenInfo[],
  lineIndex: number,
): TokenizedSubtitleLine {
  const sortedMorphemes = [...morphemes].sort((a, b) => a.position - b.position);
  const tokens: SubtitleToken[] = [];
  let cursor = 0;
  let word: SubtitleToken | null = null;

  const flushWord = () => {
    if (word) {
      tokens.push(word);
      word = null;
    }
  };

  const addPlainText = (text: string, start: number) => {
    if (!text) {
      return;
    }

    flushWord();
    tokens.push({
      id: `${lineIndex}:${start}`,
      text,
      start,
      length: text.length,
      clickable: false,
      morphemes: [],
    });
  };

  for (const morpheme of sortedMorphemes) {
    const end = Math.min(line.length, morpheme.position + morpheme.length);
    if (end <= cursor) {
      // Kiwi can give a suffix the same source span as the preceding stem.
      if (word && morpheme.position >= word.start && isClickableMorpheme(morpheme)) {
        word.morphemes.push(toMorpheme(morpheme));
      }
      continue;
    }

    const start = Math.max(cursor, morpheme.position);
    addPlainText(line.slice(cursor, start), cursor);
    const text = line.slice(start, end);

    if (!text) {
      continue;
    }

    if (!isClickableMorpheme(morpheme)) {
      addPlainText(text, morpheme.position);
    } else if (word && word.start + word.length === start) {
      word.text += text;
      word.length += text.length;
      word.morphemes.push(toMorpheme(morpheme));
    } else {
      flushWord();
      word = {
        id: `${lineIndex}:${morpheme.position}`,
        text,
        start,
        length: text.length,
        clickable: true,
        morphemes: [toMorpheme(morpheme)],
      };
    }

    cursor = Math.max(cursor, end);
  }

  addPlainText(line.slice(cursor), cursor);
  flushWord();

  return { text: line, tokens };
}
