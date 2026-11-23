import type { DictionaryEntry } from '@/types/messages';

export const JMDICT_RELEASES = 'https://github.com/scriptin/jmdict-simplified/releases';
export const PINNED_JMDICT_ARCHIVE = 'jmdict-eng-3.6.2+20261116213322.json.tgz';
export const JMDICT_DOWNLOAD = `${JMDICT_RELEASES}/download/3.6.2%2B20261116213322/${encodeURIComponent(PINNED_JMDICT_ARCHIVE)}`;

export interface JapaneseForm {
  text: string;
  common: boolean;
}

export interface JapaneseSense {
  spellings: string[];
  readings: string[];
  pos: string[];
  gloss: string[];
  examples: string[];
}

export interface JapaneseWord {
  id: string;
  kanji: JapaneseForm[];
  kana: (JapaneseForm & { spellings: string[] })[];
  senses: JapaneseSense[];
}

export interface JapaneseDictionaryInfo {
  version: string;
  date: string;
  words: number;
  sha256: string;
}

export interface JapaneseIndex {
  info: JapaneseDictionaryInfo;
  labels: Record<string, string>;
  forms: Map<string, Map<string, string[]>>;
  words: Map<string, Map<string, JapaneseWord>>;
}

export const normalizeJapanese = (text: string): string => text.normalize('NFKC').trim()
  .replace(/[ァ-ヶ]/gu, (kana) => String.fromCharCode(kana.charCodeAt(0) - 0x60));
export const formBucket = (text: string): string => String.fromCodePoint(text.codePointAt(0)!);
export const wordBucket = (id: string): string => id.slice(0, -3);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText);
const includes = (values: string[], spelling: string) => values.includes('*') || values.includes(spelling);

function readForm(value: unknown): JapaneseForm {
  if (!isRecord(value) || !isText(value.text) || typeof value.common !== 'boolean') throw invalid();
  return { text: value.text, common: value.common };
}

function readSense(value: unknown): JapaneseSense {
  if (!isRecord(value) || !isStrings(value.appliesToKanji) || !isStrings(value.appliesToKana) ||
    !isStrings(value.partOfSpeech) || !Array.isArray(value.gloss)) throw invalid();
  const gloss = value.gloss.flatMap((item: unknown) => {
    if (!isRecord(item) || !isText(item.text) || !isText(item.lang)) throw invalid();
    return item.lang === 'eng' ? [item.text] : [];
  });
  const examples = Array.isArray(value.examples) ? value.examples.flatMap((example: unknown) => {
    if (!isRecord(example) || !Array.isArray(example.sentences)) return [];
    return example.sentences.flatMap((sentence: unknown) =>
      isRecord(sentence) && sentence.lang === 'jpn' && isText(sentence.text) ? [sentence.text] : []);
  }).slice(0, 2) : [];
  return { spellings: value.appliesToKanji, readings: value.appliesToKana, pos: value.partOfSpeech, gloss, examples };
}

function invalid() {
  return new Error('Choose a valid JMdict Simplified English JSON or .json.tgz release.');
}

function bucket<K, V>(index: Map<string, Map<K, V>>, key: string): Map<K, V> {
  const existing = index.get(key);
  if (existing) return existing;
  const added = new Map<K, V>();
  index.set(key, added);
  return added;
}

/** Build a deterministic index so the same source preserves the same vocabulary identities across imports. */
export function buildJapaneseIndex(data: unknown, sha256: string): JapaneseIndex {
  if (!isRecord(data) || !isText(data.version) || !isText(data.dictDate) ||
    !Array.isArray(data.words) || data.words.length > 400_000 || !isRecord(data.tags)) throw invalid();
  const labels = Object.fromEntries(Object.entries(data.tags).filter((pair): pair is [string, string] => isText(pair[1])));
  const index: JapaneseIndex = {
    info: { version: data.version, date: data.dictDate, words: 0, sha256 }, labels, forms: new Map(), words: new Map(),
  };
  for (const record of data.words as unknown[]) {
    if (!isRecord(record) || typeof record.id !== 'string' || !/^\d{1,12}$/u.test(record.id) ||
      !Array.isArray(record.kanji) || !Array.isArray(record.kana) || !Array.isArray(record.sense)) throw invalid();
    const kanji = record.kanji.map(readForm);
    const kana = record.kana.map((reading: unknown) => {
      if (!isRecord(reading) || !isStrings(reading.appliesToKanji)) throw invalid();
      return { ...readForm(reading), spellings: reading.appliesToKanji };
    });
    const senses = record.sense.map(readSense).filter((sense) => sense.gloss.length);
    if (!kana.length || !senses.length) continue;
    const words = bucket(index.words, wordBucket(record.id));
    if (words.has(record.id)) throw invalid();
    words.set(record.id, { id: record.id, kanji, kana, senses });
    index.info.words += 1;
    for (const key of new Set([...kanji, ...kana].map(({ text }) => normalizeJapanese(text)).filter(Boolean))) {
      const forms = bucket(index.forms, formBucket(key));
      const ids = forms.get(key);
      if (ids) ids.push(record.id);
      else forms.set(key, [record.id]);
    }
  }
  if (!index.info.words) throw invalid();
  return index;
}

export interface JapaneseMatch {
  entry: DictionaryEntry;
  pos: string[];
  common: boolean;
}

export function matchJapaneseWord(word: JapaneseWord, form: string, labels: Record<string, string>): JapaneseMatch[] {
  const key = normalizeJapanese(form);
  return word.kana.flatMap((reading) => {
    const katakanaOrKana = normalizeJapanese(reading.text) === key;
    const allowed = word.kanji.filter(({ text }) => includes(reading.spellings, text));
    const spellings = katakanaOrKana ? allowed : allowed.filter(({ text }) => normalizeJapanese(text) === key);
    if (!katakanaOrKana && !spellings.length) return [];
    const senses = word.senses.filter((sense) => includes(sense.readings, reading.text) &&
      (sense.spellings.includes('*') || spellings.some(({ text }) => sense.spellings.includes(text))));
    if (!senses.length) return [];
    const pos = [...new Set(senses.flatMap((sense) => sense.pos))];
    const headword = (katakanaOrKana ? reading : spellings[0]!).text;
    const aliases = allowed.filter(({ text }) =>
      word.senses.some((sense) => includes(sense.readings, reading.text) && includes(sense.spellings, text)),
    ).map(({ text }) => text);
    return [{
      pos,
      common: reading.common || spellings.some(({ common }) => common),
      entry: {
        headword, originalForm: form, pronunciation: reading.text, koreanDefinitions: [],
        japanese: { id: `${word.id}:${normalizeJapanese(reading.text)}`, reading: reading.text, aliases: [reading.text, ...aliases] },
        partOfSpeech: pos.map((tag) => Object.hasOwn(labels, tag) ? labels[tag] : tag).join(', '),
        definitions: [...new Set(senses.map((sense) => sense.gloss.join('; ')))],
        examples: [...new Set(senses.flatMap((sense) => sense.examples))],
      },
    }];
  });
}
