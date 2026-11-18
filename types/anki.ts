import type { AnkiDeckStatistics } from './statistics';

export const ANKI_FIELD_ROLES = ['word', 'sentence', 'definition', 'pronunciation', 'image', 'audio'] as const;
export type AnkiFieldRole = typeof ANKI_FIELD_ROLES[number];

export const ANKI_DEFAULT_FIELDS: Record<AnkiFieldRole, string> = {
  word: 'Focus Word',
  sentence: 'Sentence',
  definition: 'Definition',
  pronunciation: 'Pronunciation',
  image: 'Image',
  audio: 'Audio',
};

export interface AnkiSettings {
  port: number;
  apiKey: string;
  deckName: string;
  modelName: string;
  fields: Record<AnkiFieldRole, string>;
}

export const DEFAULT_ANKI_SETTINGS: AnkiSettings = {
  port: 8765,
  apiKey: '',
  deckName: '',
  modelName: 'Kimchi Sentence Mining',
  fields: ANKI_DEFAULT_FIELDS,
};

export interface AnkiSyncResult {
  headword: string;
  status: 'created' | 'updated' | 'existing' | 'failed';
  message?: string;
}

export interface AnkiTranslation {
  headword: string;
  korean: string[];
  english: string[];
}

export interface AnkiImportPreview {
  headwords: string[];
  total: number;
  alreadyKnown: number;
  skipped: number;
}

export type AnkiMessage =
  | { type: 'get-anki-deck-statistics' }
  | { type: 'get-anki-settings' }
  | { type: 'save-anki-settings'; settings: AnkiSettings }
  | { type: 'connect-anki'; port: number; apiKey: string; requestPermission: boolean }
  | { type: 'get-anki-fields'; port: number; apiKey: string; modelName: string }
  | { type: 'count-unsynced'; settings: AnkiSettings }
  | { type: 'preview-anki-import'; settings: AnkiSettings; deckName: string }
  | { type: 'import-anki-words'; headwords: string[] }
  | { type: 'sync-anki'; settings: AnkiSettings; translations: AnkiTranslation[] };

export type AnkiResponse = {
  ok: true;
  settings?: AnkiSettings;
  deckStatistics?: AnkiDeckStatistics | null;
  decks?: string[];
  models?: string[];
  fields?: string[];
  unsynced?: number;
  importPreview?: AnkiImportPreview;
  markedKnown?: number;
  results?: AnkiSyncResult[];
} | { ok: false; error: string };
