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
