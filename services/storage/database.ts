export const DICTIONARY_CACHE_STORE = 'dictionaryCache';
export const VOCABULARY_STORE = 'vocabulary';

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }

    const request = indexedDB.open('korean-reader', 2);
    request.onupgradeneeded = (event) => {
      if (event.oldVersion < 1) {
        request.result.createObjectStore(DICTIONARY_CACHE_STORE, { keyPath: 'key' });
      }
      if (event.oldVersion < 2) {
        request.result.createObjectStore(VOCABULARY_STORE, { keyPath: 'headword' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local storage.'));
  });
}
