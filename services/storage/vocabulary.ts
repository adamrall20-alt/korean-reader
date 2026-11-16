import { openDatabase, VOCABULARY_STORE } from '@/services/storage/database';
import { sameVocabularyContext, type VocabularyEntry, type VocabularyMessage } from '@/types/vocabulary';

const normalizeHeadword = (headword: string) => headword.trim().normalize('NFC');

async function readVocabulary<T>(read: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = read(database.transaction(VOCABULARY_STORE).objectStore(VOCABULARY_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

async function updateVocabulary<T>(
  headword: string,
  update: (store: IDBObjectStore, entry: VocabularyEntry | undefined) => T,
): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(VOCABULARY_STORE, 'readwrite');
      const store = transaction.objectStore(VOCABULARY_STORE);
      const request = store.get(headword);
      let result: T;
      let updateError: unknown;
      request.onsuccess = () => {
        try {
          result = update(store, request.result as VocabularyEntry | undefined);
        } catch (error) {
          updateError = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () =>
        reject(updateError ?? transaction.error ?? new Error('Could not save vocabulary.'));
    });
  } finally {
    database.close();
  }
}

export function getVocabulary(headword: string): Promise<VocabularyEntry | undefined> {
  return readVocabulary((store) => store.get(normalizeHeadword(headword)));
}

export function listVocabulary(): Promise<VocabularyEntry[]> {
  return readVocabulary((store) => store.getAll());
}

export function mineWord(message: Extract<VocabularyMessage, { type: 'mine-word' }>) {
  const headword = normalizeHeadword(message.entry.headword);
  return updateVocabulary(headword, (store, existing) => {
    if (existing?.contexts.some((context) => sameVocabularyContext(context, message.context))) {
      return 'existing' as const;
    }

    const now = new Date().toISOString();
    const context = { ...message.context, minedAt: now };
    const entry: VocabularyEntry = existing
      ? { ...existing, contexts: [...existing.contexts, context], status: 'known', updatedAt: now }
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
    return existing ? 'added' as const : 'mined' as const;
  });
}

export function changeVocabulary(message: Extract<VocabularyMessage, { headword: string }>) {
  const headword = normalizeHeadword(message.headword);
  return updateVocabulary(headword, (store, existing) => {
    if (message.type === 'delete-vocabulary') {
      store.delete(headword);
      return;
    }
    if (!existing) throw new Error('This word is no longer in your vocabulary.');

    const changes = message.type === 'edit-vocabulary'
      ? { definitions: message.definitions }
      : { status: message.status };
    store.put({ ...existing, ...changes, updatedAt: new Date().toISOString() });
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
