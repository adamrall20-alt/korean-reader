import type { KnownWordChange } from '@/types/known-sync';
import type { VocabularyEntry } from '@/types/vocabulary';
import { KNOWN_CHANGES_STORE, openDatabase, STATISTICS_STORE, VOCABULARY_STORE } from './database';
import { recordKnownWordCount } from './statistics';

interface CachedChange extends KnownWordChange {
  pending: 0 | 1;
}

export function queueKnownChange(transaction: IDBTransaction, headword: string, known: boolean): void {
  const store = transaction.objectStore(KNOWN_CHANGES_STORE);
  const current = store.get(headword);
  current.onsuccess = () => {
    const previous = current.result as CachedChange | undefined;
    store.put({ headword, known, revision: Math.max(Date.now(), (previous?.revision ?? 0) + 1), pending: 1 } satisfies CachedChange);
  };
}

export async function listKnownChanges(onlyPending = true): Promise<KnownWordChange[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const store = db.transaction(KNOWN_CHANGES_STORE).objectStore(KNOWN_CHANGES_STORE);
    const request = onlyPending ? store.index('pending').getAll(1) : store.getAll();
    request.onsuccess = () => resolve((request.result as CachedChange[]).map(({ headword, revision, known }) => ({ headword, revision, known })));
    request.onerror = () => reject(request.error);
  });
}

export async function applyDesktopKnownWords(incoming: KnownWordChange[]): Promise<boolean> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([KNOWN_CHANGES_STORE, VOCABULARY_STORE, STATISTICS_STORE], 'readwrite');
    const changes = transaction.objectStore(KNOWN_CHANGES_STORE);
    const vocabulary = transaction.objectStore(VOCABULARY_STORE);
    const now = new Date().toISOString();
    const remote = new Map(incoming.map((change) => [change.headword, change]));
    const cache = changes.getAll();
    let changed = false;

    cache.onsuccess = () => {
      let remaining = 0;
      for (const local of cache.result as CachedChange[]) {
        const word = remote.get(local.headword);
        if (!word) continue;
        if (local.revision > word.revision ||
            (local.revision === word.revision && !local.known && word.known)) {
          remote.delete(local.headword);
        } else if (local.revision === word.revision && local.known === word.known) {
          if (local.pending) changes.put({ ...local, pending: 0 });
          remote.delete(local.headword);
        }
      }
      for (const word of remote.values()) {
        changes.put({ ...word, pending: 0 } satisfies CachedChange);
        remaining += 1;
        const request = vocabulary.get(word.headword);
        request.onsuccess = () => {
          const existing = request.result as VocabularyEntry | undefined;
          if (word.known && existing?.status !== 'known') {
            vocabulary.put(existing ? { ...existing, status: 'known' } : {
              headword: word.headword, originalForm: word.headword, definitions: [], koreanDefinitions: [],
              contexts: [], examples: [], status: 'known', createdAt: now, updatedAt: now,
            } satisfies VocabularyEntry);
            changed = true;
          } else if (!word.known && existing?.status === 'known') {
            vocabulary.put({ ...existing, status: 'unknown' });
            changed = true;
          }
          remaining -= 1;
          if (!remaining && changed) recordKnownWordCount(transaction);
        };
      }
    };
    transaction.oncomplete = () => resolve(changed);
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not save desktop Known words.'));
  });
}
