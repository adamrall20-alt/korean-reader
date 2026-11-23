import { expect, it } from 'vitest';
import { japaneseRankKey, parseJitenRanks, parseKanjidic } from '@/services/japanese/extras';
import { encodeJapaneseKnownWords, parseJapaneseKnownWords, parseKnownWords } from '@/services/storage/known-words';

it('keeps Jiten entries for two readings of the same form separate', () => {
  const ranks = parseJitenRanks('\uFEFFWord,Reading,Frequency Rank\n"生物","セイブツ",100\n生物,なまもの,6500\n生物,セイブツ,300');
  expect(ranks.get(japaneseRankKey('生物', 'せいぶつ'))).toBe(100);
  expect(ranks.get(japaneseRankKey('生物', 'なまもの'))).toBe(6500);
});

it('reads KANJIDIC2 Japanese readings and English meanings without unrelated codes', () => {
  const info = parseKanjidic({ characters: [{ literal: '食', readingMeaning: { groups: [{
    readings: [{ type: 'ja_on', value: 'ショク' }, { type: 'ja_kun', value: 'た.べる' }, { type: 'pinyin', value: 'shi2' }],
    meanings: [{ lang: 'en', value: 'eat' }, { lang: 'es', value: 'comer' }],
  }] } }] });
  expect(info.get('食')).toEqual({ character: '食', readings: ['ショク', 'た.べる'], meanings: ['eat'] });
});

it('round-trips distinct Japanese identities and rejects them in the Korean importer', () => {
  const words = ['せいぶつ', 'なまもの'].map((reading) => ({
    headword: '生物', japanese: { id: '1234:' + reading, reading, aliases: ['生物'] },
  }));
  const file = encodeJapaneseKnownWords([...words, words[0]!]);
  expect(parseJapaneseKnownWords(file)).toEqual(words);
  expect(() => parseKnownWords(file)).toThrow('Korean Reader known-word JSON');
});
