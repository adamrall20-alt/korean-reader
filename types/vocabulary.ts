import type { DictionaryEntry } from '@/types/messages';

export const VOCABULARY_REVISION_KEY = 'vocabularyRevision';

/**
 * Value written to `VOCABULARY_REVISION_KEY` after vocabulary changes. When `known`/`unknown` are present,
 * YouTube tabs apply them to their cached known set instead of reloading every known headword.
 * A plain string (or a value without changes) means "reload everything".
 */
export interface VocabularyRevision {
  id: string;
  known?: string[];
  unknown?: string[];
}

export function vocabularyRevisionChanges(value: unknown): { known: string[]; unknown: string[] } | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { known, unknown } = value as VocabularyRevision;
  const isList = (list: unknown): list is string[] =>
    Array.isArray(list) && list.every((item) => typeof item === 'string');
  if (!isList(known) || !isList(unknown)) return undefined;
  return { known, unknown };
}

export interface VocabularySummary {
  knownCount: number;
  /** Mined entries with context screenshots and audio removed. */
  minedEntries: VocabularyEntry[];
}

export interface KnownHeadwordsMessage {
  type: 'get-known-headwords';
}

export type KnownHeadwordsResponse = { ok: true; headwords: string[] } | { ok: false };

export type VocabularyStatus = 'known' | 'unknown';

export interface VocabularyContext {
  sentence: string;
  originalForm: string;
  sourceUrl: string;
  sourceTitle: string;
  timestamp?: number;
  image?: string;
  audio?: string;
}

export interface VocabularyEntry extends DictionaryEntry {
  contexts: Array<VocabularyContext & { minedAt: string }>;
  machineDefinitions?: string[];
  ankiNoteId?: number;
  ankiSyncedAt?: string;
  ankiFocusField?: string;
  status: VocabularyStatus;
  createdAt: string;
  updatedAt: string;
}

export type VocabularyMessage =
  | { type: 'mine-word'; entry: DictionaryEntry; context: VocabularyContext; machineDefinitions: string[] }
  | { type: 'mark-word-known'; headword: string }
  | { type: 'list-vocabulary' }
  | { type: 'get-vocabulary-summary' }
  | { type: 'edit-vocabulary'; headword: string; definitions: string[] }
  | { type: 'set-vocabulary-status'; headword: string; status: VocabularyStatus }
  | { type: 'delete-vocabulary'; headword: string };

export type VocabularyResponse =
  | {
    ok: true;
    entries?: VocabularyEntry[];
    summary?: VocabularySummary;
    outcome?: 'mined' | 'added' | 'audio-added' | 'existing';
  }
  | { ok: false; error: string };

export function sameVocabularyContext(a: VocabularyContext, b: VocabularyContext): boolean {
  return a.sentence === b.sentence && a.sourceUrl === b.sourceUrl;
}
