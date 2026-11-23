import type { VocabularyContext, VocabularyMessage } from '@/types/vocabulary';
import type { ReaderLanguage } from './language';

export interface PingMessage {
  type: 'ping';
}

export interface PingResponse {
  ok: boolean;
  version: string;
}

export interface KoreanMorpheme {
  text: string;
  tag: string;
  position: number;
  length: number;
}

export interface SubtitleToken {
  id: string;
  text: string;
  start: number;
  length: number;
  clickable: boolean;
  morphemes: KoreanMorpheme[];
  japaneseIds?: string[];
  /** Individual clickable nominal sub-tokens for unspaced compound nouns. */
  parts?: SubtitleToken[];
}

export interface TokenizedSubtitleLine {
  text: string;
  tokens: SubtitleToken[];
}

export interface TokenizeMessage {
  type: 'tokenize';
  language?: ReaderLanguage;
  lines: string[];
}

export interface TokenizeResponse {
  ok: boolean;
  lines?: TokenizedSubtitleLine[];
  error?: string;
}

export interface DictionaryEntry {
  headword: string;
  originalForm: string;
  frequencyRank?: number;
  koreanDefinitions: string[];
  definitions: string[];
  partOfSpeech?: string;
  pronunciation?: string;
  hanja?: string[];
  conjugations?: string[];
  examples: string[];
  japanese?: JapaneseLexeme;
}

export interface JapaneseLexeme {
  /** Stable dictionary entry and reading identity. */
  id: string;
  reading: string;
  aliases: string[];
}

export interface LookupMessage {
  type: 'lookup';
  language?: ReaderLanguage;
  word: string;
  morphemes: KoreanMorpheme[];
}

export interface LookupResponse {
  ok: boolean;
  entry?: DictionaryEntry;
  savedContexts?: VocabularyContext[];
  japaneseMatches?: JapaneseLookupMatch[];
  error?: string;
}

export interface JapaneseLookupMatch {
  entry: DictionaryEntry;
  savedContexts?: VocabularyContext[];
  isKnown?: boolean;
}

export interface GetSettingsMessage {
  type: 'get-settings';
}

export interface SettingsResponse {
  ok: boolean;
  krDictApiKey?: string;
  error?: string;
}

export interface SetKrDictApiKeyMessage {
  type: 'set-krdict-api-key';
  apiKey: string;
}

export interface ClearDictionaryCacheMessage {
  type: 'clear-dictionary-cache';
}

export type ExtensionMessage =
  | PingMessage
  | TokenizeMessage
  | LookupMessage
  | GetSettingsMessage
  | SetKrDictApiKeyMessage
  | ClearDictionaryCacheMessage
  | VocabularyMessage;
