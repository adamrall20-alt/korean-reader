import { hasJapaneseText } from '@/types/language';
import { normalizeJapanese } from './jmdict';

export interface KanjiDetail { character: string; readings: string[]; meanings: string[] }

interface KanjiRecord {
  literal?: unknown;
  readingMeaning?: { groups?: { readings?: { type?: string; value?: unknown }[]; meanings?: { lang?: string; value?: unknown }[] }[] };
}

export function parseKanjidic(source: unknown): Map<string, KanjiDetail> {
  const items = (source as { characters?: unknown } | null)?.characters;
  if (!Array.isArray(items) || items.length > 30_000) throw new Error('Choose a KANJIDIC2 JSON archive from JMdict Simplified.');
  const result = new Map<string, KanjiDetail>();
  for (const record of items as (KanjiRecord | null)[]) {
    const character = record?.literal;
    if (typeof character !== 'string' || !/^\p{Script=Han}$/u.test(character)) continue;
    const groups = Array.isArray(record?.readingMeaning?.groups) ? record.readingMeaning.groups : [];
    const readings = new Set<string>();
    const meanings = new Set<string>();
    for (const group of groups) {
      for (const item of Array.isArray(group?.readings) ? group.readings : []) {
        if ((item?.type === 'ja_on' || item?.type === 'ja_kun') && typeof item.value === 'string') readings.add(item.value);
      }
      for (const item of Array.isArray(group?.meanings) ? group.meanings : []) {
        if (item?.lang === 'en' && typeof item.value === 'string') meanings.add(item.value);
      }
    }
    if (readings.size || meanings.size) result.set(character, { character, readings: [...readings], meanings: [...meanings] });
  }
  if (!result.size) throw new Error('This KANJIDIC2 file contains no usable readings or meanings.');
  return result;
}

function csvRow(line: string): string[] {
  return [...line.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/gu)]
    .map((match) => (match[1]?.replaceAll('""', '"') ?? match[2] ?? '').trim());
}

export function japaneseRankKey(word: string, reading = '') {
  return normalizeJapanese(word) + '\t' + normalizeJapanese(reading);
}

export function parseJitenRanks(text: string): Map<string, number> {
  const [header, ...rows] = text.replace(/^\uFEFF/u, '').split(/\r?\n/u);
  const columns = csvRow(header ?? '').map((name) => name.toLowerCase().replace(/[^a-z]/gu, ''));
  const wordColumn = columns.findIndex((name) => /^(word|term|spelling|expression|headword|text)$/u.test(name));
  const readingColumn = columns.findIndex((name) => /^(reading|kana|wordreading)$/u.test(name));
  const rankColumn = columns.findIndex((name) => /^(rank|frequency|frequencyrank|mediarank|mediafrequencyrank)$/u.test(name));
  if (wordColumn < 0 || rankColumn < 0) throw new Error('Choose a Jiten CSV with word and rank columns.');
  const ranks = new Map<string, number>();
  for (const row of rows) {
    const parts = csvRow(row);
    const word = parts[wordColumn] ?? '';
    const rank = Number(parts[rankColumn]);
    if (!hasJapaneseText(word) || !Number.isSafeInteger(rank) || rank < 1 || word.length > 100) continue;
    const key = japaneseRankKey(word, parts[readingColumn] ?? '');
    ranks.set(key, Math.min(rank, ranks.get(key) ?? rank));
  }
  if (!ranks.size) throw new Error('This CSV contains no usable Japanese ranks.');
  return ranks;
}
