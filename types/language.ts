export type ReaderLanguage = 'ko' | 'ja';

export function isOptionalReaderLanguage(value: unknown): value is ReaderLanguage | undefined {
  return value === undefined || value === 'ko' || value === 'ja';
}

export const READING_LANGUAGE_KEY = 'readingLanguage';
export const GET_READING_LANGUAGE = 'get-reading-language';
export const SET_READING_LANGUAGE = 'set-reading-language';
export const READING_LANGUAGE_CHANGED = 'reading-language-changed';
export const LANGUAGE_NAMES = { ko: 'Korean', ja: 'Japanese' } as const;

export function readingLanguage(value: unknown): ReaderLanguage {
  return value === 'ja' ? 'ja' : 'ko';
}

export function hasJapaneseKana(text: string): boolean {
  return /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
}

export function hasJapaneseText(text: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
}
