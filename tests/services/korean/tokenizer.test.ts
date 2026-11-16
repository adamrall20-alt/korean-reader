import { describe, expect, it } from 'vitest';
import { tokenizeSubtitleLine } from '@/services/korean/tokenizer';
import type { TokenInfo } from 'kiwi-nlp';

function morpheme(
  str: string,
  position: number,
  length: number,
  tag: string,
): TokenInfo {
  return {
    str,
    position,
    length,
    tag,
    wordPosition: 0,
    sentPosition: 0,
    lineNumber: 0,
    score: 0,
    typoCost: 0,
    typoFormId: 0,
    pairedToken: -1,
    subSentPosition: 0,
    morphId: -1,
  };
}

describe('Korean subtitle tokenization', () => {
  it('groups morphemes into clickable words and preserves spacing', () => {
    const line = '공부하고 있어요.';
    const result = tokenizeSubtitleLine(
      line,
      [
        morpheme('공부', 0, 2, 'NNG'),
        morpheme('하', 2, 1, 'XSV'),
        morpheme('고', 3, 1, 'EC'),
        morpheme('있', 5, 1, 'VX'),
        morpheme('어요', 6, 2, 'EF'),
        morpheme('.', 8, 1, 'SF'),
      ],
      0,
    );

    expect(result.tokens.map((token) => [token.text, token.clickable])).toEqual([
      ['공부하고', true],
      [' ', false],
      ['있어요', true],
      ['.', false],
    ]);
  });

  it('keeps punctuation and non-Korean text non-clickable', () => {
    const line = '안녕, world!';
    const result = tokenizeSubtitleLine(
      line,
      [
        morpheme('안녕', 0, 2, 'NNG'),
        morpheme(',', 2, 1, 'SP'),
        morpheme('world', 4, 5, 'SL'),
        morpheme('!', 9, 1, 'SF'),
      ],
      0,
    );

    expect(result.tokens.map((token) => [token.text, token.clickable])).toEqual([
      ['안녕', true],
      [',', false],
      [' ', false],
      ['world', false],
      ['!', false],
    ]);
  });
});
