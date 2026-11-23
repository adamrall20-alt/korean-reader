import { hasJapaneseText } from '@/types/language';
import type { JapaneseKnownWord } from '@/types/vocabulary';

const FORMAT = 'korean-reader-known-words';

export const MAX_KNOWN_WORD_FILE_BYTES = 64 * 1024 * 1024;

export function isKoreanHeadword(word: unknown): word is string {
  return typeof word === 'string' && word.length <= 100 && /\p{Script=Hangul}/u.test(word);
}

export function isKnownHeadwordList(words: unknown): words is string[] {
  return Array.isArray(words) && words.length <= 200_000 && words.every(isKoreanHeadword);
}

export function encodeKnownWords(headwords: string[]): string {
  if (!isKnownHeadwordList(headwords)) throw new Error('The known-word list cannot be exported in this format.');
  return JSON.stringify({ format: FORMAT, version: 1, headwords });
}

export function parseKnownWords(text: string): string[] {
  const file: unknown = JSON.parse(text);
  if (!file || typeof file !== 'object' ||
      !('format' in file) || file.format !== FORMAT ||
      !('version' in file) || file.version !== 1 ||
      !('headwords' in file) || !isKnownHeadwordList(file.headwords)) {
    throw new Error('Choose a Korean Reader known-word JSON export.');
  }
  return [...new Set(file.headwords.map((word) => word.trim().normalize('NFC')))];
}

function isJapaneseKnownWord(item: unknown): item is JapaneseKnownWord {
  if (!item || typeof item !== 'object' || !('headword' in item) || typeof item.headword !== 'string' ||
      item.headword.length > 100 || !hasJapaneseText(item.headword) ||
      !('japanese' in item) || !item.japanese || typeof item.japanese !== 'object') return false;
  const lexeme = item.japanese;
  return 'id' in lexeme && typeof lexeme.id === 'string' && /^\d{1,12}:[^\s:]{1,100}$/u.test(lexeme.id) &&
    lexeme.id === lexeme.id.normalize('NFC') && 'reading' in lexeme && typeof lexeme.reading === 'string' &&
    lexeme.reading.length <= 100 && hasJapaneseText(lexeme.reading) && 'aliases' in lexeme &&
    Array.isArray(lexeme.aliases) && lexeme.aliases.length <= 100 &&
    lexeme.aliases.every((alias: unknown) => typeof alias === 'string' && alias.length > 0 && alias.length <= 100);
}

export function isJapaneseKnownWordList(words: unknown): words is JapaneseKnownWord[] {
  return Array.isArray(words) && words.length <= 200_000 && words.every(isJapaneseKnownWord);
}

export function encodeJapaneseKnownWords(words: JapaneseKnownWord[]): string {
  if (!isJapaneseKnownWordList(words)) throw new Error('Could not export Japanese known words.');
  return JSON.stringify({ format: FORMAT, version: 2, language: 'ja', words });
}

export function parseJapaneseKnownWords(text: string): JapaneseKnownWord[] {
  const file = JSON.parse(text) as { format?: unknown; version?: unknown; language?: unknown; words?: unknown } | null;
  if (!file || file.format !== FORMAT || file.version !== 2 || file.language !== 'ja' || !isJapaneseKnownWordList(file.words)) {
    throw new Error('Choose a Japanese known-word JSON export.');
  }
  return [...new Map(file.words.map((word) => [word.japanese.id, word])).values()];
}
