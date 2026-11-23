export type ReaderLanguage = 'ko' | 'ja';

export function isOptionalReaderLanguage(value: unknown): value is ReaderLanguage | undefined {
  return value === undefined || value === 'ko' || value === 'ja';
}
