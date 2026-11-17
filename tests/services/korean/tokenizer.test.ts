import { describe, expect, it } from 'vitest';
import { tokenizeSubtitleLine } from '@/services/korean/tokenizer';
import { dictionaryCandidates } from '@/services/korean/dictionary-forms';
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

  it('preserves the implicit copula in 의사예요 for dictionary lookup', () => {
    const { tokens } = tokenizeSubtitleLine('의사예요', [
      morpheme('의사', 0, 2, 'NNG'),
      morpheme('이', 2, 0, 'VCP'),
      morpheme('예요', 2, 2, 'EF'),
    ], 0);

    expect(tokens).toHaveLength(1);
    const token = tokens[0]!;
    expect(dictionaryCandidates(token.text, token.morphemes, new Set(['이다'])))
      .toEqual(['의사', '이다', '의사예요']);
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
