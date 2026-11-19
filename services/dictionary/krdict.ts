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

function extractXmlText(raw: string): string {
  return raw
    .split(/(<!\[CDATA\[[\s\S]*?\]\]>)/g)
    .map((part) => {
      const cdata = part.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
      return cdata ? cdata[1]! : decodeXml(part.replace(/<[^>]+>/g, ''));
    })
    .join('')
    .trim();
}

function readTag(source: string, tag: string): string | undefined {
  const match = source.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!match?.[1]) return undefined;
  const value = extractXmlText(match[1]);
  return value || undefined;
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

      const gloss = readTag(translation, 'trans_word');
      const definition = readTag(translation, 'trans_dfn');
      if (gloss && definition) {
        return [gloss.toLowerCase() === definition.toLowerCase() ? definition : `${gloss}: ${definition}`];
      }
      const meaning = definition ?? gloss;
      return meaning ? [meaning] : [];
    }),
  );
  return [...new Set(definitions)];
}

function parseResponse(xmlText: string, candidate: string, originalForm: string) {
  validateResponse(xmlText);
  const items = readBlocks(xmlText, 'item').filter(
    (result) => readTag(result, 'word')?.normalize('NFC') === candidate,
  );
  const item = items[0];
  if (!item) {
    return null;
  }

  const senses = items.flatMap((result) => readBlocks(result, 'sense'));
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
      .map((example) => extractXmlText(example))
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

function headwordCacheKey(headword: string): string {
  return JSON.stringify(['headword-v2', headword]);
}

async function readCache(key: string): Promise<DictionaryEntry | undefined> {
  try {
    return await getCachedDictionaryEntry(key);
  } catch (error: unknown) {
    console.warn('[Korean Reader] Dictionary cache read failed.', error);
    return undefined;
  }
}

async function writeCache(key: string, entry: DictionaryEntry): Promise<void> {
  try {
    await cacheDictionaryEntry(key, entry);
  } catch (error: unknown) {
    console.warn('[Korean Reader] Dictionary cache write failed.', error);
  }
}

export async function lookupKoreanWord(
  word: string,
  morphemes: KoreanMorpheme[],
  apiKey: string,
  known?: ReadonlySet<string>,
): Promise<DictionaryEntry> {
  const candidates = dictionaryCandidates(word, morphemes, known);
  if (!candidates.length) {
    throw new Error(`No dictionary entry was found for “${word}”.`);
  }

  const cachedFirst = await readCache(headwordCacheKey(candidates[0]!));
  if (cachedFirst) {
    return { ...cachedFirst, originalForm: word };
  }

  const listCacheKey = JSON.stringify(['exact-v5', ...candidates]);
  const cachedList = await readCache(listCacheKey);
  if (cachedList) {
    const normalizedHeadword = cachedList.headword.trim().normalize('NFC');
    if (normalizedHeadword) {
      await writeCache(headwordCacheKey(normalizedHeadword), {
        ...cachedList,
        originalForm: normalizedHeadword,
      });
    }
    return { ...cachedList, originalForm: word };
  }

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    if (index > 0) {
      const cachedCandidate = await readCache(headwordCacheKey(candidate));
      if (cachedCandidate) {
        const normalizedHeadword = cachedCandidate.headword.trim().normalize('NFC');
        await writeCache(listCacheKey, {
          ...cachedCandidate,
          originalForm: normalizedHeadword || candidate,
        });
        return { ...cachedCandidate, originalForm: word };
      }
    }

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

      const normalizedHeadword = entry.headword.trim().normalize('NFC');
      const entryToCache: DictionaryEntry = { ...entry, originalForm: normalizedHeadword || candidate };
      await writeCache(headwordCacheKey(candidate), entryToCache);
      if (normalizedHeadword && normalizedHeadword !== candidate) {
        await writeCache(headwordCacheKey(normalizedHeadword), entryToCache);
      }
      if (index > 0) {
        await writeCache(listCacheKey, entryToCache);
      }
      return entry;
    }
  }

  throw new Error(`No dictionary entry was found for “${word}”.`);
}
