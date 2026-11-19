import { afterEach, describe, expect, it, vi } from 'vitest';
import { listKnownHeadwords, readVocabularySummary } from '@/services/storage/vocabulary';
import type { VocabularyEntry } from '@/types/vocabulary';

const { openDatabase } = vi.hoisted(() => ({ openDatabase: vi.fn() }));
vi.mock('@/services/storage/database', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/storage/database')>(),
  openDatabase,
}));

type Request = { result: unknown; error: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null };

/**
 * Minimal IndexedDB stand-in exposing the status index and a cursor over the vocabulary store.
 * Requests settle in microtasks; the transaction completes in a later macrotask, after all of them.
 */
function fakeDatabase(entries: VocabularyEntry[], options: { failCursor?: boolean } = {}) {
  const calls = { getAll: 0, getAllKeys: [] as unknown[], count: [] as unknown[] };
  const database = {
    transaction() {
      let failed = false;
      const transaction = {
        error: null as unknown,
        oncomplete: null as (() => void) | null,
        onabort: null as (() => void) | null,
        onerror: null as (() => void) | null,
        objectStore: () => store,
      };
      setTimeout(() => { if (!failed) transaction.oncomplete?.(); });
      const request = (result: () => unknown): Request => {
        const created: Request = { result: undefined, error: null, onsuccess: null, onerror: null };
        queueMicrotask(() => { created.result = result(); created.onsuccess?.(); });
        return created;
      };
      const known = () => entries.filter((entry) => entry.status === 'known');
      const store = {
        getAll: () => { calls.getAll += 1; return request(() => entries); },
        index: () => ({
          getAllKeys: (query: unknown) => {
            calls.getAllKeys.push(query);
            return request(() => known().map((entry) => entry.headword));
          },
          count: (query: unknown) => { calls.count.push(query); return request(() => known().length); },
        }),
        openCursor: () => {
          const cursor: Request = { result: undefined, error: null, onsuccess: null, onerror: null };
          const visit = (position: number) => queueMicrotask(() => {
            if (options.failCursor) {
              failed = true;
              transaction.error = cursor.error = new Error('Cursor failed');
              cursor.onerror?.();
              transaction.onerror?.();
              transaction.onabort?.();
              return;
            }
            const value = entries[position];
            cursor.result = value ? { value: structuredClone(value), continue: () => visit(position + 1) } : null;
            cursor.onsuccess?.();
          });
          visit(0);
          return cursor;
        },
      };
      return transaction;
    },
  };
  return { database, calls };
}

const entry = (headword: string, status: 'known' | 'unknown', mined = false): VocabularyEntry => ({
  headword,
  originalForm: headword,
  definitions: [],
  koreanDefinitions: ['뜻'],
  examples: [],
  contexts: mined ? [{
    sentence: `${headword} 문장`,
    originalForm: headword,
    sourceTitle: 'Video',
    sourceUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
    image: 'data:image/jpeg;base64,AAAA',
    audio: 'subtitle-audio:1',
    timestamp: 3,
    minedAt: '2026-11-16T00:00:00.000Z',
  }] : [],
  status,
  createdAt: '2026-11-16T00:00:00.000Z',
  updatedAt: '2026-11-16T00:00:00.000Z',
});

describe('vocabulary storage reads', () => {
  afterEach(() => openDatabase.mockReset());

  it('reads known headwords through the status index without loading full records', async () => {
    const { database, calls } = fakeDatabase([entry('먹다', 'known'), entry('학생', 'unknown'), entry('가다', 'known', true)]);
    openDatabase.mockResolvedValue(database);

    await expect(listKnownHeadwords()).resolves.toEqual(['먹다', '가다']);
    expect(calls.getAllKeys).toEqual(['known']);
    expect(calls.getAll).toBe(0);
  });

  it('summarises the known count and mined entries without screenshots or audio', async () => {
    const entries = [entry('먹다', 'known'), entry('학생', 'unknown', true), entry('가다', 'known', true)];
    const { database, calls } = fakeDatabase(entries);
    openDatabase.mockResolvedValue(database);

    const summary = await readVocabularySummary();
    expect(summary.knownCount).toBe(2);
    expect(calls.count).toEqual(['known']);
    expect(summary.minedEntries.map((item) => item.headword)).toEqual(['학생', '가다']);
    for (const mined of summary.minedEntries) {
      expect(mined.contexts[0]).not.toHaveProperty('image');
      expect(mined.contexts[0]).not.toHaveProperty('audio');
      expect(mined.contexts[0]).toMatchObject({ sentence: `${mined.headword} 문장`, timestamp: 3 });
    }
    // The stored records are untouched.
    expect(entries[2]!.contexts[0]!.image).toBe('data:image/jpeg;base64,AAAA');
  });

  it('returns an empty summary for an empty vocabulary', async () => {
    openDatabase.mockResolvedValue(fakeDatabase([]).database);
    await expect(readVocabularySummary()).resolves.toEqual({ knownCount: 0, minedEntries: [] });
  });

  it('reports storage failures', async () => {
    openDatabase.mockRejectedValueOnce(new Error('IndexedDB is unavailable.'));
    await expect(listKnownHeadwords()).rejects.toThrow('IndexedDB is unavailable.');
    openDatabase.mockResolvedValue(fakeDatabase([entry('먹다', 'known')], { failCursor: true }).database);
    await expect(readVocabularySummary()).rejects.toThrow('Cursor failed');
  });
});
