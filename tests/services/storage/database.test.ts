import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCachedDictionaryEntry } from '@/services/dictionary/cache';
import {
  closeDatabase,
  DICTIONARY_CACHE_STORE,
  openDatabase,
  STATISTICS_STORE,
  statisticsStore,
  vocabularyStore,
  VOCABULARY_STATUS_INDEX,
  VOCABULARY_STORE,
} from '@/services/storage/database';
import { readKnownWordHistory } from '@/services/storage/statistics';
import { getVocabulary } from '@/services/storage/vocabulary';

interface FakeDatabase {
  close: ReturnType<typeof vi.fn>;
  onversionchange: ((event: Event) => void) | null;
  onclose: ((event: Event) => void) | null;
  transaction: (storeNames: string | string[], mode?: IDBTransactionMode) => unknown;
}

function createFakeDatabase(storeResults: Record<string, unknown> = {}): FakeDatabase {
  return {
    close: vi.fn(),
    onversionchange: null,
    onclose: null,
    transaction() {
      const tx = {
        oncomplete: null as ((event: Event) => void) | null,
        onabort: null as ((event: Event) => void) | null,
        error: null as DOMException | null,
        objectStore(name: string) {
          const scheduleRequest = (result: unknown) => {
            const request = {
              result,
              error: null as DOMException | null,
              onsuccess: null as (() => void) | null,
              onerror: null as (() => void) | null,
            };
            queueMicrotask(() => {
              request.onsuccess?.();
              queueMicrotask(() => {
                tx.oncomplete?.(new Event('complete'));
              });
            });
            return request;
          };

          return {
            get: () => scheduleRequest(storeResults[name]),
            getAll: () => scheduleRequest(storeResults[name] ?? []),
          };
        },
      };
      return tx;
    },
  };
}

function installFakeIndexedDb(
  openBehavior: (callIndex: number, request: {
    result: FakeDatabase | null;
    error: Error | null;
    onsuccess: (() => void) | null;
    onerror: (() => void) | null;
    onupgradeneeded: ((event: { oldVersion: number }) => void) | null;
  }) => void,
) {
  let calls = 0;
  const open = vi.fn(() => {
    calls += 1;
    const request = {
      result: null as FakeDatabase | null,
      error: null as Error | null,
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onupgradeneeded: null as ((event: { oldVersion: number }) => void) | null,
      onblocked: null as ((event: unknown) => void) | null,
    };
    openBehavior(calls, request);
    return request;
  });

  vi.stubGlobal('indexedDB', { open });
  return { open };
}

describe('IndexedDB connection reuse', () => {
  afterEach(async () => {
    await closeDatabase();
    vi.unstubAllGlobals();
  });

  it('reuses a single connection across concurrent and sequential calls', async () => {
    const db = createFakeDatabase();
    const { open } = installFakeIndexedDb((_call, request) => {
      queueMicrotask(() => {
        request.result = db;
        request.onsuccess?.();
      });
    });

    const [first, second] = await Promise.all([openDatabase(), openDatabase()]);
    const third = await openDatabase();

    expect(first).toBe(db);
    expect(second).toBe(db);
    expect(third).toBe(db);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('korean-reader', 5);
  });

  it('adds Japanese stores on upgrade without recreating Korean stores', async () => {
    const createIndex = vi.fn();
    const db = { ...createFakeDatabase(), createObjectStore: vi.fn(() => ({ createIndex })) };
    installFakeIndexedDb((_call, request) => {
      queueMicrotask(() => {
        request.result = db;
        request.onupgradeneeded?.({ oldVersion: 4 });
        request.onsuccess?.();
      });
    });
    await openDatabase();
    expect(db.createObjectStore.mock.calls).toEqual([
      [vocabularyStore('ja'), { keyPath: 'japanese.id' }], [statisticsStore('ja')],
    ]);
    expect(createIndex).toHaveBeenCalledWith(VOCABULARY_STATUS_INDEX, 'status');
  });

  it('clears the cached connection when opening fails asynchronously or throws synchronously', async () => {
    const db = createFakeDatabase();
    const { open } = installFakeIndexedDb((call, request) => {
      if (call === 1) {
        throw new Error('Open threw synchronously');
      }
      if (call === 2) {
        queueMicrotask(() => {
          request.error = new Error('Open failed asynchronously');
          request.onerror?.();
        });
        return;
      }
      queueMicrotask(() => {
        request.result = db;
        request.onsuccess?.();
      });
    });

    await expect(openDatabase()).rejects.toThrow('Open threw synchronously');
    await expect(openDatabase()).rejects.toThrow('Open failed asynchronously');
    await expect(openDatabase()).resolves.toBe(db);
    expect(open).toHaveBeenCalledTimes(3);
  });

  it('rejects when indexedDB is unavailable without poisoning later calls', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(openDatabase()).rejects.toThrow('IndexedDB is unavailable.');

    const db = createFakeDatabase();
    const { open } = installFakeIndexedDb((_call, request) => {
      queueMicrotask(() => {
        request.result = db;
        request.onsuccess?.();
      });
    });

    await expect(openDatabase()).resolves.toBe(db);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('closes and clears the cached connection on versionchange', async () => {
    const firstDb = createFakeDatabase();
    const secondDb = createFakeDatabase();
    const { open } = installFakeIndexedDb((call, request) => {
      queueMicrotask(() => {
        request.result = call === 1 ? firstDb : secondDb;
        request.onsuccess?.();
      });
    });

    const openedFirst = await openDatabase();
    expect(openedFirst).toBe(firstDb);

    firstDb.onversionchange?.(new Event('versionchange'));
    expect(firstDb.close).toHaveBeenCalledTimes(1);

    const openedSecond = await openDatabase();
    expect(openedSecond).toBe(secondDb);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('clears the cached connection when the database closes unexpectedly', async () => {
    const firstDb = createFakeDatabase();
    const secondDb = createFakeDatabase();
    const { open } = installFakeIndexedDb((call, request) => {
      queueMicrotask(() => {
        request.result = call === 1 ? firstDb : secondDb;
        request.onsuccess?.();
      });
    });

    await openDatabase();
    firstDb.onclose?.(new Event('close'));

    const reopened = await openDatabase();
    expect(reopened).toBe(secondDb);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('closes the active connection and opens a fresh one after closeDatabase()', async () => {
    const firstDb = createFakeDatabase();
    const secondDb = createFakeDatabase();
    const { open } = installFakeIndexedDb((call, request) => {
      queueMicrotask(() => {
        request.result = call === 1 ? firstDb : secondDb;
        request.onsuccess?.();
      });
    });

    await openDatabase();
    await closeDatabase();
    expect(firstDb.close).toHaveBeenCalledTimes(1);

    const reopened = await openDatabase();
    expect(reopened).toBe(secondDb);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('keeps the shared connection open across vocabulary, statistics, and dictionary cache callers', async () => {
    const db = createFakeDatabase({
      [VOCABULARY_STORE]: { headword: '안녕', status: 'known' },
      [STATISTICS_STORE]: [{ at: 1000, count: 10 }],
      [DICTIONARY_CACHE_STORE]: { key: 'k', entry: { headword: '안녕', originalForm: '안녕', definitions: ['hello'], koreanDefinitions: [], examples: [] } },
    });
    const { open } = installFakeIndexedDb((_call, request) => {
      queueMicrotask(() => {
        request.result = db;
        request.onsuccess?.();
      });
    });

    const [vocab, history, cached] = await Promise.all([
      getVocabulary('안녕'),
      readKnownWordHistory(false),
      getCachedDictionaryEntry('k'),
    ]);

    expect(vocab?.headword).toBe('안녕');
    expect(history?.baseline).toEqual({ at: 1000, count: 10 });
    expect(cached?.headword).toBe('안녕');
    expect(open).toHaveBeenCalledTimes(1);
    expect(db.close).not.toHaveBeenCalled();
  });
});
