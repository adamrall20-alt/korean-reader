import type { DictionaryEntry } from '@/types/messages';

import { DICTIONARY_CACHE_STORE as STORE_NAME, openDatabase } from '@/services/storage/database';

interface DictionaryCacheRecord {
  key: string;
  entry: DictionaryEntry;
}

export async function getCachedDictionaryEntry(
  key: string,
): Promise<DictionaryEntry | undefined> {
  if (typeof indexedDB === 'undefined') {
    return undefined;
  }

  const database = await openDatabase();

  return new Promise<DictionaryEntry | undefined>((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .get(key);

    request.onsuccess = () =>
      resolve((request.result as DictionaryCacheRecord | undefined)?.entry);
    request.onerror = () =>
      reject(request.error ?? new Error('Could not read the dictionary cache.'));
  }).finally(() => database.close());
}

export async function cacheDictionaryEntry(key: string, entry: DictionaryEntry): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return;
  }

  const database = await openDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({ key, entry } satisfies DictionaryCacheRecord);

    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Could not write the dictionary cache.'));
  }).finally(() => database.close());
}

export async function clearDictionaryCache(): Promise<void> {
  const database = await openDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).clear();

    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Could not clear the dictionary cache.'));
  }).finally(() => database.close());
}
