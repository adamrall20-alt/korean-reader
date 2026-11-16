import type { DictionaryEntry, KoreanMorpheme } from '@/types/messages';
import { cacheDictionaryEntry, getCachedDictionaryEntry } from '@/services/dictionary/cache';

const API_URL = 'https://krdict.korean.go.kr/api/search';

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
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

function parseResponse(xmlText: string, originalForm: string): DictionaryEntry | null {
  const apiError = readTag(xmlText, 'error') ?? readTag(xmlText, 'error_message');

  if (apiError) {
    throw new Error(apiError);
  }

  const item = readBlocks(xmlText, 'item')[0];
  if (!item) {
    return null;
  }

  const senses = readBlocks(item, 'sense');
  const koreanDefinitions = senses.flatMap((sense) => {
    const definition = readTag(sense, 'definition');
    return definition ? [definition] : [];
  });
  const definitions = senses.flatMap((sense) =>
    readBlocks(sense, 'translation').flatMap((translation) =>
      readBlocks(translation, 'trans_dfn')
        .map((value) => decodeXml(value.replace(/<[^>]+>/g, '').trim()))
        .filter((value) => value.length > 0),
    ),
  );

  return {
    headword: readTag(item, 'word') ?? originalForm,
    originalForm,
    koreanDefinitions,
    definitions,
    partOfSpeech: readTag(item, 'pos'),
    pronunciation: readTag(item, 'pronunciation'),
    examples: readBlocks(item, 'example')
      .map((example) => decodeXml(example.replace(/<[^>]+>/g, '').trim()))
      .filter((example) => example.length > 0),
  };
}

function candidateWords(word: string, morphemes: KoreanMorpheme[]): string[] {
  const lexicalMorphemes = morphemes.filter((morpheme) =>
    /^(NN|VV|VA|VX|XR|XSV|XSA|MAG)/u.test(morpheme.tag),
  );
  const lexicalForm = lexicalMorphemes.map((morpheme) => morpheme.text).join('');
  const hasPredicate = lexicalMorphemes.some((morpheme) =>
    /^(VV|VA|VX|XSV|XSA)/u.test(morpheme.tag),
  );
  const dictionaryForm = hasPredicate && lexicalForm.length > 0 ? `${lexicalForm}다` : '';
  const candidates = [
    word,
    dictionaryForm,
    ...morphemes
      .filter((morpheme) => /^(NN|VV|VA|VX|MAG|XR)/u.test(morpheme.tag))
      .map((morpheme) => morpheme.text),
  ];

  return [...new Set(candidates.filter((candidate) => candidate.length > 0))];
}

export async function lookupKoreanWord(
  word: string,
  morphemes: KoreanMorpheme[],
  apiKey: string,
): Promise<DictionaryEntry> {
  for (const candidate of candidateWords(word, morphemes)) {
    try {
      const cachedEntry = await getCachedDictionaryEntry(candidate);
      if (cachedEntry) {
        return { ...cachedEntry, originalForm: word };
      }
    } catch (error: unknown) {
      console.warn('[Korean Reader] Dictionary cache read failed.', error);
    }

    const params = new URLSearchParams({
      key: apiKey,
      q: candidate,
      translated: 'y',
      trans_lang: '1',
      num: '10',
    });
    const response = await fetch(`${API_URL}?${params}`);

    if (!response.ok) {
      throw new Error(`KRDict request failed with HTTP ${response.status}.`);
    }

    const entry = parseResponse(await response.text(), word);
    if (entry && (entry.definitions.length > 0 || entry.koreanDefinitions.length > 0)) {
      try {
        await cacheDictionaryEntry(candidate, entry);
      } catch (error: unknown) {
        console.warn('[Korean Reader] Dictionary cache write failed.', error);
      }
      return entry;
    }
  }

  throw new Error(`No dictionary entry was found for “${word}”.`);
}
