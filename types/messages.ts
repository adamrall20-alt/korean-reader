import type { VocabularyContext, VocabularyMessage } from '@/types/vocabulary';

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
}

export interface TokenizedSubtitleLine {
  text: string;
  tokens: SubtitleToken[];
}

export interface TokenizeMessage {
  type: 'tokenize';
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
  koreanDefinitions: string[];
  definitions: string[];
  partOfSpeech?: string;
  pronunciation?: string;
  hanja?: string[];
  conjugations?: string[];
  examples: string[];
}

export interface LookupMessage {
  type: 'lookup';
  word: string;
  morphemes: KoreanMorpheme[];
}

export interface LookupResponse {
  ok: boolean;
  entry?: DictionaryEntry;
  savedContexts?: VocabularyContext[];
  error?: string;
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
