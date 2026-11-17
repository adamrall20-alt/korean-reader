import type { DictionaryEntry, KoreanMorpheme } from '@/types/messages';
import { dictionaryCandidates } from '@/services/korean/dictionary-forms';
import { cacheDictionaryEntry, getCachedDictionaryEntry } from '@/services/dictionary/cache';

const API_URL = 'https://krdict.korean.go.kr/api';

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

function readTag(source: string, tag: string): string | undefined {
  const match = source.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  const value = match?.[1]?.replace(/<[^>]+>/g, '').trim();
  return value ? decodeXml(value) : undefined;
}

function readBlocks(source: string, tag: string): string[] {
  const blocks: string[] = [];
  const expression = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi');
  let match: RegExpExecArray | null;

  while ((match = expression.exec(source)) !== null) {
    blocks.push(match[1] ?? '');
  }

  return blocks;
}

function validateResponse(xmlText: string): void {
  const errorBlock = readBlocks(xmlText, 'error')[0];
  const apiError = errorBlock !== undefined
    ? readTag(errorBlock, 'message') ?? 'KRDict returned an API error.'
    : readTag(xmlText, 'error_message');

  if (apiError) {
    throw new Error(apiError);
  }

  if (!/<channel(?:\s[^>]*)?\s*\/>|<channel(?:\s[^>]*)?>[\s\S]*<\/channel>/i.test(xmlText)) {
    throw new Error('KRDict returned an invalid dictionary response.');
  }
}

function englishDefinitions(senses: string[]): string[] {
  const definitions = senses.flatMap((sense) =>
    readBlocks(sense, 'translation').flatMap((translation) => {
      const language = readTag(translation, 'trans_lang');
      if (language && !/^(영어|english|en|1)$/i.test(language)) return [];

      const meaning = readTag(translation, 'trans_dfn') ?? readTag(translation, 'trans_word');
      return meaning ? [meaning] : [];
    }),
  );
  return [...new Set(definitions)];
}

function parseResponse(xmlText: string, candidate: string, originalForm: string) {
  validateResponse(xmlText);
  const item = readBlocks(xmlText, 'item').find(
    (result) => readTag(result, 'word')?.normalize('NFC') === candidate,
  );
  if (!item) {
    return null;
  }

  const senses = readBlocks(item, 'sense');
  const koreanDefinitions = senses.flatMap((sense) => {
    const definition = readTag(sense, 'definition');
    return definition ? [definition] : [];
  });
  const entry: DictionaryEntry = {
    headword: readTag(item, 'word') ?? candidate,
    originalForm,
    koreanDefinitions,
    definitions: englishDefinitions(senses),
    partOfSpeech: readTag(item, 'pos'),
    pronunciation: readTag(item, 'pronunciation'),
    examples: readBlocks(item, 'example')
      .map((example) => decodeXml(example.replace(/<[^>]+>/g, '').trim()))
      .filter((example) => example.length > 0),
  };
  return { entry, targetCode: readTag(item, 'target_code') };
}

async function addEntryDetails(
  entry: DictionaryEntry,
  targetCode: string,
  apiKey: string,
): Promise<void> {
  const params = new URLSearchParams({
    key: apiKey,
    method: 'target_code',
    q: targetCode,
    translated: 'y',
    trans_lang: '1',
  });
  const response = await fetch(`${API_URL}/view?${params}`, {
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) return;

  const xml = await response.text();
  validateResponse(xml);
  const info = readBlocks(xml, 'word_info')[0];
  if (!info || readTag(info, 'word') !== entry.headword) return;

  // Read headword pronunciation before the conjugation and sense sections.
  const headwordInfo = info.split(/<conju_info>|<sense_info>/i, 1)[0] ?? '';
  entry.pronunciation = readTag(headwordInfo, 'pronunciation') ?? entry.pronunciation;
  const hanja = readBlocks(info, 'original_language_info').flatMap((block) => {
    const original = readTag(block, 'original_language');
    return original && /\p{Script=Han}/u.test(original) ? [original] : [];
  });
  if (hanja.length) entry.hanja = hanja;
  const conjugations = readBlocks(info, 'conju_info').flatMap((block) => {
    return [readTag(block, 'conjugation'), readTag(block, 'abbreviation')].filter(
      (form): form is string => Boolean(form),
    );
  });
  if (conjugations.length) entry.conjugations = [...new Set(conjugations)];
  const senses = readBlocks(info, 'sense_info');
  const definitions = englishDefinitions(senses);
  if (!entry.definitions.length && definitions.length) entry.definitions = definitions;
  if (!entry.koreanDefinitions.length) {
    entry.koreanDefinitions = senses.flatMap((sense) => {
      const definition = readTag(sense, 'definition');
      return definition ? [definition] : [];
    });
  }
  const examples = senses.flatMap((sense) =>
    readBlocks(sense, 'example_info').flatMap((block) => {
      const example = readTag(block, 'example');
      return example ? [example] : [];
    }),
  );
  if (examples.length) entry.examples = [...new Set(examples)];
}

export async function lookupKoreanWord(
  word: string,
  morphemes: KoreanMorpheme[],
  apiKey: string,
  known?: ReadonlySet<string>,
): Promise<DictionaryEntry> {
  const candidates = dictionaryCandidates(word, morphemes, known);
  const cacheKey = JSON.stringify(['exact-v3', ...candidates]);

  try {
    const cachedEntry = await getCachedDictionaryEntry(cacheKey);
    if (cachedEntry) return { ...cachedEntry, originalForm: word };
  } catch (error: unknown) {
    console.warn('[Korean Reader] Dictionary cache read failed.', error);
  }

  for (const candidate of candidates) {
    const params = new URLSearchParams({
      key: apiKey,
      q: candidate,
      translated: 'y',
      trans_lang: '1',
      advanced: 'y',
      method: 'exact',
      num: '10',
    });
    const response = await fetch(`${API_URL}/search?${params}`, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) {
      throw new Error(`KRDict request failed with HTTP ${response.status}.`);
    }

    const result = parseResponse(await response.text(), candidate, word);
    if (result) {
      const { entry, targetCode } = result;
      if (targetCode && /^\d+$/.test(targetCode)) {
        try {
          await addEntryDetails(entry, targetCode, apiKey);
        } catch {
          // A search result is still usable if optional details are unavailable.
        }
      }
      if (!entry.definitions.length && !entry.koreanDefinitions.length) continue;

      try {
        await cacheDictionaryEntry(cacheKey, entry);
      } catch (error: unknown) {
        console.warn('[Korean Reader] Dictionary cache write failed.', error);
      }
      return entry;
    }
  }

  throw new Error(`No dictionary entry was found for “${word}”.`);
}
