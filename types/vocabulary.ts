import type { DictionaryEntry } from '@/types/messages';

export const VOCABULARY_REVISION_KEY = 'vocabularyRevision';

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
  | { type: 'list-vocabulary' }
  | { type: 'edit-vocabulary'; headword: string; definitions: string[] }
  | { type: 'set-vocabulary-status'; headword: string; status: VocabularyStatus }
  | { type: 'delete-vocabulary'; headword: string };

export type VocabularyResponse =
  | { ok: true; entries?: VocabularyEntry[]; outcome?: 'mined' | 'added' | 'audio-added' | 'existing' }
  | { ok: false; error: string };

export function sameVocabularyContext(a: VocabularyContext, b: VocabularyContext): boolean {
  return a.sentence === b.sentence && a.sourceUrl === b.sourceUrl;
}
