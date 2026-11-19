export const DICTIONARY_CACHE_STORE = 'dictionaryCache';
export const VOCABULARY_STORE = 'vocabulary';

export const STATISTICS_STORE = 'statistics';
export const VOCABULARY_STATUS_INDEX = 'status';

let databasePromise: Promise<IDBDatabase> | null = null;

function clearCachedDatabase(promise: Promise<IDBDatabase>): void {
  if (databasePromise === promise) {
    databasePromise = null;
  }
}

export function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable.'));
  }

  if (databasePromise) {
    return databasePromise;
  }

  let request: IDBOpenDBRequest;
  try {
    request = indexedDB.open('korean-reader', 3);
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error('Could not open local storage.'));
  }

  let cleared = false;
  const openPromise: Promise<IDBDatabase> = new Promise((resolve, reject) => {
    const clear = () => {
      cleared = true;
      clearCachedDatabase(openPromise);
    };

    request.onupgradeneeded = (event) => {
      if (event.oldVersion < 1) {
        request.result.createObjectStore(DICTIONARY_CACHE_STORE, { keyPath: 'key' });
      }
      if (event.oldVersion < 2) {
        request.result.createObjectStore(VOCABULARY_STORE, { keyPath: 'headword' });
      }
      if (event.oldVersion < 3) {
        request.transaction!.objectStore(VOCABULARY_STORE).createIndex(VOCABULARY_STATUS_INDEX, 'status');
        request.result.createObjectStore(STATISTICS_STORE);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        clear();
        database.close();
      };
      database.onclose = () => {
        clear();
      };
      resolve(database);
    };
    request.onerror = () => {
      clear();
      reject(request.error ?? new Error('Could not open local storage.'));
    };
  });

  if (!cleared) {
    databasePromise = openPromise;
  }

  return openPromise;
}

export async function closeDatabase(): Promise<void> {
  const pending = databasePromise;
  if (!pending) {
    return;
  }

  databasePromise = null;
  try {
    const database = await pending;
    database.close();
  } catch {
    // Opening failed; nothing to close.
  }
}
