import { describe, expect, it } from 'vitest';
import { transcriptVocabulary, vocabularyCoverage } from '@/services/korean/coverage';
import type { KoreanMorpheme, TokenizedSubtitleLine } from '@/types/messages';

const line = (text: string, morphemes: KoreanMorpheme[] = []): TokenizedSubtitleLine => ({
  text, tokens: [{ id: '0:0', text, start: 0, length: text.length, clickable: true, morphemes }],
});
const morph = (text: string, tag: string): KoreanMorpheme => ({ text, tag, position: 0, length: text.length });

describe('unique transcript vocabulary coverage', () => {
  it('counts repeated words once and formats one decimal place', () => {
    const words = transcriptVocabulary([...Array.from({ length: 10 }, () => line('사과')), line('배')]);
    expect(vocabularyCoverage(words, new Set(['사과']))).toEqual({ known: 1, total: 2, percentage: '50.0' });
    const large = transcriptVocabulary(Array.from({ length: 500 }, (_, i) => line(`단어${i}`)));
    expect(vocabularyCoverage(large, new Set(Array.from({ length: 434 }, (_, i) => `단어${i}`))).percentage).toBe('86.8');
  });

  it('deduplicates conjugations and aliases, excluding grammatical text', () => {
    const words = transcriptVocabulary([
      line('먹어요', [morph('먹', 'VV'), morph('어요', 'EF')]),
      line('먹었다', [morph('먹', 'VV'), morph('었', 'EP'), morph('다', 'EF')]),
      line('이거'), line('이것'), line('를', [morph('를', 'JKO')]), line('!'),
    ]);
    expect(vocabularyCoverage(words, new Set(['먹다', '이것']))).toEqual({ known: 2, total: 2, percentage: '100.0' });
  });

  it('uses stable lexical counts for compounds and fused predicates', () => {
    const words = transcriptVocabulary([
      line('한국어공부', [morph('한국어', 'NNG'), morph('공부', 'NNG')]),
      line('먹어봐', [morph('먹', 'VV'), morph('어', 'EC'), morph('보', 'VX')]),
    ]);
    expect(vocabularyCoverage(words, new Set()).total).toBe(4);
    expect(vocabularyCoverage(words, new Set(['한국어공부', '먹다']))).toEqual({ known: 3, total: 4, percentage: '75.0' });
    expect(vocabularyCoverage(new Map(), new Set()).percentage).toBeNull();
  });
});
