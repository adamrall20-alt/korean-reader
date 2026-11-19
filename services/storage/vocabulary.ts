import type { AnkiTranslation } from '@/types/anki';
import { openDatabase, STATISTICS_STORE, VOCABULARY_STATUS_INDEX, VOCABULARY_STORE } from '@/services/storage/database';
import { recordKnownWordCount } from './statistics';
import {
  sameVocabularyContext, type VocabularyEntry, type VocabularyMessage, type VocabularySummary,
} from '@/types/vocabulary';

export const normalizeHeadword = (headword: string) => headword.trim().normalize('NFC');

async function readVocabulary<T>(read: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const request = read(database.transaction(VOCABULARY_STORE).objectStore(VOCABULARY_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function updateVocabulary<T>(
  headword: string,
  update: (store: IDBObjectStore, entry: VocabularyEntry | undefined, transaction: IDBTransaction) => T,
): Promise<T> {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction([VOCABULARY_STORE, STATISTICS_STORE], 'readwrite');
    const store = transaction.objectStore(VOCABULARY_STORE);
    const request = store.get(headword);
    let result: T;
    let updateError: unknown;
    request.onsuccess = () => {
      try {
        result = update(store, request.result as VocabularyEntry | undefined, transaction);
      } catch (error) {
        updateError = error;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () =>
      reject(updateError ?? transaction.error ?? new Error('Could not save vocabulary.'));
  });
}

export function getVocabulary(headword: string): Promise<VocabularyEntry | undefined> {
  return readVocabulary((store) => store.get(normalizeHeadword(headword)));
}

export function listVocabulary(): Promise<VocabularyEntry[]> {
  return readVocabulary((store) => store.getAll());
}

/** Reads only the keys of known entries through the status index, without loading full records. */
export function listKnownHeadwords(): Promise<string[]> {
  return readVocabulary((store) => store.index(VOCABULARY_STATUS_INDEX).getAllKeys('known')) as Promise<string[]>;
}

/** Known-word count plus mined entries without their screenshots and audio, for the toolbar popup. */
export async function readVocabularySummary(): Promise<VocabularySummary> {
  const database = await openDatabase();
  return new Promise<VocabularySummary>((resolve, reject) => {
    const transaction = database.transaction(VOCABULARY_STORE);
    const store = transaction.objectStore(VOCABULARY_STORE);
    const summary: VocabularySummary = { knownCount: 0, minedEntries: [] };
    const count = store.index(VOCABULARY_STATUS_INDEX).count('known');
    count.onsuccess = () => { summary.knownCount = count.result; };
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current) return;
      const entry = current.value as VocabularyEntry;
      if (entry.contexts.length) {
        summary.minedEntries.push({
          ...entry,
          contexts: entry.contexts.map(({ image: _image, audio: _audio, ...context }) => context),
        });
      }
      current.continue();
    };
    transaction.oncomplete = () => resolve(summary);
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not read saved vocabulary.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not read saved vocabulary.'));
  });
}

export async function markHeadwordsKnown(words: string[]): Promise<number> {
  const database = await openDatabase();
  return new Promise<number>((resolve, reject) => {
    const transaction = database.transaction([VOCABULARY_STORE, STATISTICS_STORE], 'readwrite');
    const store = transaction.objectStore(VOCABULARY_STORE);
    const now = new Date().toISOString();
    let marked = 0;
    transaction.oncomplete = () => resolve(marked);
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not mark words as known.'));

    const headwords = new Set(words.map(normalizeHeadword).filter(Boolean));
    let remaining = headwords.size;
    for (const headword of headwords) {
      const request = store.get(headword);
      request.onsuccess = () => {
        const existing = request.result as VocabularyEntry | undefined;
        if (existing?.status !== 'known') {
          const entry: VocabularyEntry = existing ? { ...existing, status: 'known', updatedAt: now } : {
            headword, originalForm: headword, definitions: [], koreanDefinitions: [], examples: [],
            contexts: [], status: 'known', createdAt: now, updatedAt: now,
          };
          store.put(entry);
          marked += 1;
        }
        remaining -= 1;
        if (!remaining && marked) recordKnownWordCount(transaction);
      };
    }
  });
}

export function mineWord(message: Extract<VocabularyMessage, { type: 'mine-word' }>) {
  const headword = normalizeHeadword(message.entry.headword);
  return updateVocabulary(headword, (store, existing, transaction) => {
    const index = existing?.contexts.findIndex((context) => sameVocabularyContext(context, message.context)) ?? -1;
    if (existing && index >= 0) {
      const saved = existing.contexts[index]!;
      if (saved.audio || !message.context.audio) return 'existing' as const;
      const contexts = [...existing.contexts];
      contexts[index] = { ...saved, audio: message.context.audio };
      store.put({ ...existing, contexts, updatedAt: new Date().toISOString() });
      return 'audio-added' as const;
    }

    const now = new Date().toISOString();
    const context = { ...message.context, minedAt: now };
    const entry: VocabularyEntry = existing
      ? {
          ...existing,
          ...(!existing.contexts.length ? {
            ...message.entry,
            headword,
            definitions: existing.definitions.length ? existing.definitions : message.entry.definitions,
          } : {}),
          contexts: [...existing.contexts, context],
          machineDefinitions: existing.machineDefinitions?.length ? existing.machineDefinitions : message.machineDefinitions,
          status: 'known',
          updatedAt: now,
        }
      : {
          ...message.entry,
          headword,
          contexts: [context],
          machineDefinitions: message.machineDefinitions,
          status: 'known',
          createdAt: now,
          updatedAt: now,
        };
    store.put(entry);
    if (existing?.status !== 'known') recordKnownWordCount(transaction);
    return existing?.contexts.length ? 'added' as const : 'mined' as const;
  });
}

export function changeVocabulary(message: Extract<VocabularyMessage, {
  type: 'delete-vocabulary' | 'edit-vocabulary' | 'set-vocabulary-status';
}>) {
  const headword = normalizeHeadword(message.headword);
  return updateVocabulary(headword, (store, existing, transaction) => {
    if (message.type === 'delete-vocabulary') {
      store.delete(headword);
      if (existing?.status === 'known') recordKnownWordCount(transaction);
      return;
    }
    if (!existing) throw new Error('This word is no longer in your vocabulary.');

    const changes = message.type === 'edit-vocabulary'
      ? { definitions: message.definitions }
      : { status: message.status };
    store.put({ ...existing, ...changes, updatedAt: new Date().toISOString() });
    if (message.type === 'set-vocabulary-status' &&
      (existing.status === 'known') !== (message.status === 'known')) recordKnownWordCount(transaction);
  });
}

export function recordAnkiSync(headword: string, noteId: number, focusField: string) {
  return updateVocabulary(normalizeHeadword(headword), (store, existing) => {
    if (existing) store.put({
      ...existing,
      ankiNoteId: noteId,
      ankiFocusField: focusField,
      ankiSyncedAt: new Date().toISOString(),
    });
  });
}

export function saveMachineTranslation(translation: AnkiTranslation) {
  return updateVocabulary(normalizeHeadword(translation.headword), (store, entry) => {
    if (!entry || entry.definitions.length || entry.machineDefinitions?.length) return;
    if (!translation.korean.every((definition, index) => definition === entry.koreanDefinitions[index])) return;

    store.put({ ...entry, machineDefinitions: translation.english, updatedAt: new Date().toISOString() });
  });
}
