import { describe, expect, it } from 'vitest';
import { tokenizeSubtitleLine } from '@/services/korean/tokenizer';
import {
  dictionaryCandidates,
  isKnownHeadword,
  isKnownSubtitleWord,
  resolveRenderTokens,
} from '@/services/korean/dictionary-forms';
import type { TokenInfo } from 'kiwi-nlp';
import type { KoreanMorpheme } from '@/types/messages';

function km(text: string, position: number, length: number, tag: string): KoreanMorpheme {
  return { text, position, length, tag };
}

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

function summarize(line: string, morphemes: TokenInfo[]) {
  const result = tokenizeSubtitleLine(line, morphemes, 0);
  expect(result.tokens.map((token) => token.text).join('')).toBe(line);
  return result;
}

describe('Korean subtitle tokenization', () => {
  it('groups morphemes into clickable words and preserves spacing', () => {
    const line = '공부하고 있어요.';
    const result = summarize(line, [
      morpheme('공부', 0, 2, 'NNG'),
      morpheme('하', 2, 1, 'XSV'),
      morpheme('고', 3, 1, 'EC'),
      morpheme('있', 5, 1, 'VX'),
      morpheme('어요', 6, 2, 'EF'),
      morpheme('.', 8, 1, 'SF'),
    ]);

    expect(result.tokens.map((token) => [token.text, token.clickable])).toEqual([
      ['공부하고', true],
      [' ', false],
      ['있어요', true],
      ['.', false],
    ]);
  });

  it('splits copula constructions while preserving implicit copula lookup', () => {
    const { tokens } = summarize('의사예요', [
      morpheme('의사', 0, 2, 'NNG'),
      morpheme('이', 2, 0, 'VCP'),
      morpheme('예요', 2, 2, 'EF'),
    ]);

    expect(tokens.map((token) => [token.text, token.clickable])).toEqual([
      ['의사', true],
      ['예요', true],
    ]);
    expect(dictionaryCandidates(tokens[1]!.text, tokens[1]!.morphemes)).toEqual(['이다', '예요']);
    expect(dictionaryCandidates(
      '의사예요',
      [
        km('의사', 0, 2, 'NNG'),
        km('이', 2, 0, 'VCP'),
        km('예요', 2, 2, 'EF'),
      ],
      new Set(['이다']),
    )).toEqual(['의사', '이다', '의사예요']);
  });

  it('keeps punctuation and non-Korean text non-clickable', () => {
    const line = '안녕, world!';
    const result = summarize(line, [
      morpheme('안녕', 0, 2, 'NNG'),
      morpheme(',', 2, 1, 'SP'),
      morpheme('world', 4, 5, 'SL'),
      morpheme('!', 9, 1, 'SF'),
    ]);

    expect(result.tokens.map((token) => [token.text, token.clickable])).toEqual([
      ['안녕', true],
      [',', false],
      [' ', false],
      ['world', false],
      ['!', false],
    ]);
  });
});

describe('multi-word and auxiliary splitting', () => {
  it('splits multi-verb and auxiliary constructions across endings without merging stems', () => {
    const ate = summarize('먹어봤어요', [
      morpheme('먹', 0, 1, 'VV'),
      morpheme('어', 1, 1, 'EC'),
      morpheme('보', 2, 1, 'VX'),
      morpheme('었', 2, 1, 'EP'),
      morpheme('어요', 3, 2, 'EF'),
    ]);
    expect(ate.tokens.map((token) => [token.text, token.clickable])).toEqual([
      ['먹어', true],
      ['봤어요', true],
    ]);
    expect(dictionaryCandidates(ate.tokens[0]!.text, ate.tokens[0]!.morphemes)).toEqual(['먹다', '먹어']);
    expect(dictionaryCandidates(ate.tokens[1]!.text, ate.tokens[1]!.morphemes)).toEqual(['보다', '봤어요']);
    expect(isKnownSubtitleWord(ate.tokens[0]!, new Set(['먹다']))).toBe(true);
    expect(isKnownSubtitleWord(ate.tokens[1]!, new Set(['먹다']))).toBe(false);

    const canDo = summarize('할수있어요', [
      morpheme('하', 0, 1, 'VV'),
      morpheme('ᆯ', 0, 1, 'ETM'),
      morpheme('수', 1, 1, 'NNB'),
      morpheme('있', 2, 1, 'VA'),
      morpheme('어요', 3, 2, 'EF'),
    ]);
    expect(canDo.tokens.map((token) => [token.text, token.clickable])).toEqual([
      ['할', true],
      ['수', true],
      ['있어요', true],
    ]);
    expect(canDo.tokens.map((token) => dictionaryCandidates(token.text, token.morphemes)[0])).toEqual([
      '하다',
      '수',
      '있다',
    ]);

    const happy = summarize('행복해졌어요', [
      morpheme('행복', 0, 2, 'NNG'),
      morpheme('하', 2, 1, 'XSA'),
      morpheme('어', 2, 1, 'EC'),
      morpheme('지', 3, 1, 'VX'),
      morpheme('었', 3, 1, 'EP'),
      morpheme('어요', 4, 2, 'EF'),
    ]);
    expect(happy.tokens.map((token) => [token.text, token.clickable])).toEqual([
      ['행복해', true],
      ['졌어요', true],
    ]);
    expect(dictionaryCandidates(happy.tokens[0]!.text, happy.tokens[0]!.morphemes)).toEqual(['행복하다', '행복해']);
    expect(dictionaryCandidates(happy.tokens[1]!.text, happy.tokens[1]!.morphemes)).toEqual(['지다', '졌어요']);

    const study = summarize('한국어공부하고', [
      morpheme('한국어', 0, 3, 'NNP'),
      morpheme('공부', 3, 2, 'NNG'),
      morpheme('하', 5, 1, 'XSV'),
      morpheme('고', 6, 1, 'EC'),
    ]);
    expect(study.tokens.map((token) => [token.text, token.clickable])).toEqual([
      ['한국어', true],
      ['공부하고', true],
    ]);
    expect(dictionaryCandidates(study.tokens[0]!.text, study.tokens[0]!.morphemes)).toEqual(['한국어']);
    expect(dictionaryCandidates(study.tokens[1]!.text, study.tokens[1]!.morphemes)).toEqual(['공부하다', '공부하고']);
  });
});

describe('affixes, particles, and copula rules', () => {
  it('strips particles from adverbs and nouns as non-clickable text', () => {
    const adverb = summarize('아직도', [
      morpheme('아직', 0, 2, 'MAG'),
      morpheme('도', 2, 1, 'JX'),
    ]);
    expect(adverb.tokens.map((token) => [token.text, token.clickable])).toEqual([
      ['아직', true],
      ['도', false],
    ]);
    expect(isKnownSubtitleWord(adverb.tokens[0]!, new Set(['아직']))).toBe(true);

    const school = summarize('학교에서만', [
      morpheme('학교', 0, 2, 'NNG'),
      morpheme('에서', 2, 2, 'JKB'),
      morpheme('만', 4, 1, 'JX'),
    ]);
    expect(school.tokens.map((token) => [token.text, token.clickable])).toEqual([
      ['학교', true],
      ['에서', false],
      ['만', false],
    ]);
  });

  it('preserves prefixes (XPN) and word-forming suffixes (XSN)', () => {
    const samples: Array<[string, TokenInfo[], string]> = [
      ['신제품', [morpheme('신', 0, 1, 'XPN'), morpheme('제품', 1, 2, 'NNG')], '신제품'],
      ['불가능해요', [
        morpheme('불', 0, 1, 'XPN'),
        morpheme('가능', 1, 2, 'NNG'),
        morpheme('하', 3, 1, 'XSA'),
        morpheme('어요', 3, 2, 'EF'),
      ], '불가능하다'],
      ['선생님', [morpheme('선생', 0, 2, 'NNG'), morpheme('님', 2, 1, 'XSN')], '선생님'],
      ['대학생', [morpheme('대학', 0, 2, 'NNG'), morpheme('생', 2, 1, 'XSN')], '대학생'],
      ['가능성', [morpheme('가능', 0, 2, 'NNG'), morpheme('성', 2, 1, 'XSN')], '가능성'],
      ['현실적', [morpheme('현실', 0, 2, 'NNG'), morpheme('적', 2, 1, 'XSN')], '현실적'],
    ];

    for (const [text, morphemes, expectedHeadword] of samples) {
      const { tokens } = summarize(text, morphemes);
      expect(tokens).toHaveLength(1);
      expect(tokens[0]!.clickable).toBe(true);
      expect(dictionaryCandidates(tokens[0]!.text, tokens[0]!.morphemes)[0]).toBe(expectedHeadword);
      expect(isKnownSubtitleWord(tokens[0]!, new Set([expectedHeadword]))).toBe(true);
    }
  });

  it('strips productive suffixes 들, 쯤, 씩, 끼리 as non-clickable text', () => {
    const plural = summarize('여러분들의', [
      morpheme('여러분', 0, 3, 'NP'),
      morpheme('들', 3, 1, 'XSN'),
      morpheme('의', 4, 1, 'JKG'),
    ]);
    expect(plural.tokens.map((token) => [token.text, token.clickable])).toEqual([
      ['여러분', true],
      ['들', false],
      ['의', false],
    ]);

    const friends = summarize('친구들끼리', [
      morpheme('친구', 0, 2, 'NNG'),
      morpheme('들', 2, 1, 'XSN'),
      morpheme('끼리', 3, 2, 'XSN'),
    ]);
    expect(friends.tokens.map((token) => [token.text, token.clickable])).toEqual([
      ['친구', true],
      ['들', false],
      ['끼리', false],
    ]);

    const each = summarize('하나씩', [
      morpheme('하나', 0, 2, 'NR'),
      morpheme('씩', 2, 1, 'XSN'),
    ]);
    expect(each.tokens.map((token) => [token.text, token.clickable])).toEqual([
      ['하나', true],
      ['씩', false],
    ]);

    const approx = summarize('삼십분쯤', [
      morpheme('삼십', 0, 2, 'NR'),
      morpheme('분', 2, 1, 'NNB'),
      morpheme('쯤', 3, 1, 'XSN'),
    ]);
    expect(approx.tokens.map((token) => [token.text, token.clickable])).toEqual([
      ['삼십분', true],
      ['쯤', false],
    ]);
    expect(approx.tokens[0]!.parts?.map((part) => part.text)).toEqual(['삼십', '분']);
  });

  it('handles copula constructions with suffixes/particles and requires explicit 이다 status', () => {
    const students = summarize('학생들이에요', [
      morpheme('학생', 0, 2, 'NNG'),
      morpheme('들', 2, 1, 'XSN'),
      morpheme('이', 3, 1, 'VCP'),
      morpheme('에요', 4, 2, 'EF'),
    ]);
    expect(students.tokens.map((token) => [token.text, token.clickable])).toEqual([
      ['학생', true],
      ['들', false],
      ['이에요', true],
    ]);
    expect(isKnownSubtitleWord(students.tokens[0]!, new Set(['학생']))).toBe(true);
    expect(isKnownSubtitleWord(students.tokens[2]!, new Set(['학생']))).toBe(false);
    expect(isKnownSubtitleWord(students.tokens[2]!, new Set(['이다']))).toBe(true);

    const teacher = summarize('선생님이에요', [
      morpheme('선생', 0, 2, 'NNG'),
      morpheme('님', 2, 1, 'XSN'),
      morpheme('이', 3, 1, 'VCP'),
      morpheme('에요', 4, 2, 'EF'),
    ]);
    expect(teacher.tokens.map((token) => [token.text, token.clickable])).toEqual([
      ['선생님', true],
      ['이에요', true],
    ]);

    const atHome = summarize('집에서예요', [
      morpheme('집', 0, 1, 'NNG'),
      morpheme('에서', 1, 2, 'JKB'),
      morpheme('이', 3, 0, 'VCP'),
      morpheme('예요', 3, 2, 'EF'),
    ]);
    expect(atHome.tokens.map((token) => [token.text, token.clickable])).toEqual([
      ['집', true],
      ['에서', false],
      ['예요', true],
    ]);
  });
});

describe('fused contractions and colloquial aliases', () => {
  it('keeps fused mid-character contractions as one token and checks all underlying headwords', () => {
    const whatIsIt = summarize('뭔데요', [
      morpheme('뭐', 0, 1, 'NP'),
      morpheme('이', 0, 1, 'VCP'),
      morpheme('ᆫ데요', 0, 3, 'EF'),
    ]);
    expect(whatIsIt.tokens.map((token) => [token.text, token.clickable])).toEqual([['뭔데요', true]]);
    const token = whatIsIt.tokens[0]!;
    expect(isKnownSubtitleWord(token, new Set(['뭐']))).toBe(false);
    expect(isKnownSubtitleWord(token, new Set(['이다']))).toBe(false);
    expect(isKnownSubtitleWord(token, new Set(['뭐', '이다']))).toBe(true);
    expect(isKnownSubtitleWord(token, new Set(['무엇', '이다']))).toBe(true);
    expect(dictionaryCandidates(token.text, token.morphemes, new Set(['이다'])))
      .toEqual(['뭐', '무엇', '이다', '뭔데요']);

    const willDo = summarize('할건데', [
      morpheme('하', 0, 1, 'VV'),
      morpheme('ᆯ', 0, 1, 'ETM'),
      morpheme('거', 1, 1, 'NNB'),
      morpheme('이', 1, 1, 'VCP'),
      morpheme('ᆫ데', 1, 2, 'EC'),
    ]);
    expect(willDo.tokens.map((tokenItem) => [tokenItem.text, tokenItem.clickable])).toEqual([
      ['할', true],
      ['건데', true],
    ]);
    expect(isKnownSubtitleWord(willDo.tokens[1]!, new Set(['것']))).toBe(false);
    expect(isKnownSubtitleWord(willDo.tokens[1]!, new Set(['것', '이다']))).toBe(true);
    expect(dictionaryCandidates(willDo.tokens[1]!.text, willDo.tokens[1]!.morphemes, new Set(['이다'])))
      .toEqual(['거', '것', '이다', '건데']);

    const goingToDo = summarize('할거야', [
      morpheme('하', 0, 1, 'VV'),
      morpheme('ᆯ', 0, 1, 'ETM'),
      morpheme('거', 1, 1, 'NNB'),
      morpheme('이', 2, 0, 'VCP'),
      morpheme('야', 2, 1, 'EF'),
    ]);
    expect(goingToDo.tokens.map((tokenItem) => [tokenItem.text, tokenItem.clickable])).toEqual([
      ['할', true],
      ['거', true],
      ['야', true],
    ]);

    const fusedParticle = summarize('그게', [
      morpheme('그것', 0, 2, 'NP'),
      morpheme('이', 1, 1, 'JKS'),
    ]);
    expect(fusedParticle.tokens).toHaveLength(1);
    expect(isKnownSubtitleWord(fusedParticle.tokens[0]!, new Set(['그것']))).toBe(true);
    expect(isKnownSubtitleWord(fusedParticle.tokens[0]!, new Set(['그거']))).toBe(true);

    const fusedMe = summarize('난', [
      morpheme('나', 0, 1, 'NP'),
      morpheme('ᆫ', 0, 1, 'JX'),
    ]);
    expect(fusedMe.tokens).toHaveLength(1);
    expect(dictionaryCandidates(fusedMe.tokens[0]!.text, fusedMe.tokens[0]!.morphemes)).toEqual(['나', '난']);
    expect(isKnownSubtitleWord(fusedMe.tokens[0]!, new Set(['나']))).toBe(true);
  });

  it('matches colloquial contraction aliases symmetrically', () => {
    expect(isKnownHeadword('이거', new Set(['이것']))).toBe(true);
    expect(isKnownHeadword('이것', new Set(['이거']))).toBe(true);
    expect(isKnownHeadword('재밌다', new Set(['재미있다']))).toBe(true);
    expect(isKnownHeadword('재미있다', new Set(['재밌다']))).toBe(true);
    expect(isKnownHeadword('좀', new Set(['조금']))).toBe(true);
    expect(isKnownHeadword('갖다', new Set(['가지다']))).toBe(true);

    const fun = summarize('재밌어요', [
      morpheme('재밌', 0, 2, 'VA'),
      morpheme('어요', 2, 2, 'EF'),
    ]).tokens[0]!;
    expect(dictionaryCandidates(fun.text, fun.morphemes)).toEqual(['재밌다', '재미있다', '재밌어요']);
    expect(isKnownSubtitleWord(fun, new Set(['재미있다']))).toBe(true);
  });
});

describe('compound noun status and fallback splitting', () => {
  const { tokens } = summarize('복싱장에서', [
    morpheme('복싱', 0, 2, 'NNG'),
    morpheme('장', 2, 1, 'NNG'),
    morpheme('에서', 3, 2, 'JKB'),
  ]);
  const compoundToken = tokens[0]!;

  it('splits particles off compound nouns and looks up the whole compound before its parts', () => {
    expect(tokens.map((item) => [item.text, item.clickable])).toEqual([
      ['복싱장', true],
      ['에서', false],
    ]);
    expect(dictionaryCandidates(compoundToken.text, compoundToken.morphemes))
      .toEqual(['복싱장', '복싱', '장']);
    expect(dictionaryCandidates('복싱장에서', [
      km('복싱', 0, 2, 'NNG'),
      km('장', 2, 1, 'NNG'),
      km('에서', 3, 2, 'JKB'),
    ])).toEqual(['복싱장', '복싱장에서', '복싱', '장']);
  });

  it('keeps the compound whole when known as a whole, and splits into parts otherwise', () => {
    expect(isKnownSubtitleWord(compoundToken, new Set(['복싱장']))).toBe(true);
    expect(isKnownSubtitleWord(compoundToken, new Set(['복싱', '장']))).toBe(true);
    expect(isKnownSubtitleWord(compoundToken, new Set(['복싱']))).toBe(false);
    expect(isKnownSubtitleWord(compoundToken, new Set())).toBe(false);

    const wholeRendered = resolveRenderTokens(tokens, new Set(['복싱장']));
    expect(wholeRendered.map((item) => [item.text, item.clickable])).toEqual([
      ['복싱장', true],
      ['에서', false],
    ]);

    const splitRendered = resolveRenderTokens(tokens, new Set(['복싱']));
    expect(splitRendered.map((item) => [item.text, item.clickable])).toEqual([
      ['복싱', true],
      ['장', true],
      ['에서', false],
    ]);
    expect(isKnownSubtitleWord(splitRendered[0]!, new Set(['복싱']))).toBe(true);
    expect(isKnownSubtitleWord(splitRendered[1]!, new Set(['복싱']))).toBe(false);
  });

  it('handles unspaced compound nouns with particles like 한국어공부를', () => {
    const study = summarize('한국어공부를', [
      morpheme('한국어', 0, 3, 'NNP'),
      morpheme('공부', 3, 2, 'NNG'),
      morpheme('를', 5, 1, 'JKO'),
    ]);
    expect(study.tokens.map((item) => [item.text, item.clickable])).toEqual([
      ['한국어공부', true],
      ['를', false],
    ]);

    const split = resolveRenderTokens(study.tokens, new Set(['한국어']));
    expect(split.map((item) => [item.text, item.clickable])).toEqual([
      ['한국어', true],
      ['공부', true],
      ['를', false],
    ]);
    expect(isKnownSubtitleWord(split[0]!, new Set(['한국어']))).toBe(true);
    expect(isKnownSubtitleWord(split[1]!, new Set(['한국어']))).toBe(false);

    const whole = resolveRenderTokens(study.tokens, new Set(['한국어공부']));
    expect(whole.map((item) => item.text)).toEqual(['한국어공부', '를']);
    expect(isKnownSubtitleWord(whole[0]!, new Set(['한국어공부']))).toBe(true);
  });
});
