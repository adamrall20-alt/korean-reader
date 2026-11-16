import type { DictionaryEntry } from '@/types/messages';

const DATABASE_NAME = 'korean-reader';
const DATABASE_VERSION = 1;
const STORE_NAME = 'dictionaryCache';

interface DictionaryCacheRecord {
  key: string;
  entry: DictionaryEntry;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open dictionary cache.'));
  });
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
    const request = database
      .transaction(STORE_NAME, 'readwrite')
      .objectStore(STORE_NAME)
      .put({ key, entry } satisfies DictionaryCacheRecord);

    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error('Could not write the dictionary cache.'));
  }).finally(() => database.close());
}

export async function clearDictionaryCache(): Promise<void> {
  const database = await openDatabase();

  return new Promise<void>((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, 'readwrite')
      .objectStore(STORE_NAME)
      .clear();

    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error('Could not clear the dictionary cache.'));
  }).finally(() => database.close());
}
