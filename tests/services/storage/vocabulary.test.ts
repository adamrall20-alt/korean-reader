import { afterEach, describe, expect, it, vi } from 'vitest';
import { getVocabulary, listKnownHeadwords, markHeadwordsKnown, markJapaneseWordKnown, mineWord, readVocabularySummary } from '@/services/storage/vocabulary';
import { statisticsStore, vocabularyStore } from '@/services/storage/database';
import type { VocabularyEntry, VocabularyMessage } from '@/types/vocabulary';

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
function fakeDatabase(koreanEntries: VocabularyEntry[], options: { failCursor?: boolean } = {}) {
  const statistics = new Map();
  const japaneseEntries: VocabularyEntry[] = [];
  const japaneseStatistics = new Map();
  const calls = { getAll: 0, getAllKeys: [] as unknown[], count: [] as unknown[] };
  const database = {
    transaction() {
      let failed = false;
      const transaction = {
        error: null as unknown,
        oncomplete: null as (() => void) | null,
        onabort: null as (() => void) | null,
        onerror: null as (() => void) | null,
        objectStore(name: string) {
          if (name === statisticsStore() || name === statisticsStore('ja')) {
            const data = name === statisticsStore() ? statistics : japaneseStatistics;
            return {
              get: (key: string) => request(() => data.get(key)),
              put: (value: unknown, key: string) => request(() => data.set(key, value)),
            };
          }
          return name === vocabularyStore() ? store(koreanEntries, (entry) => entry.headword)
            : store(japaneseEntries, (entry) => entry.japanese!.id);
        },
      };
      setTimeout(() => { if (!failed) transaction.oncomplete?.(); });
      const request = (result: () => unknown): Request => {
        const created: Request = { result: undefined, error: null, onsuccess: null, onerror: null };
        queueMicrotask(() => { created.result = result(); created.onsuccess?.(); });
        return created;
      };
      const store = (entries: VocabularyEntry[], entryKey: (entry: VocabularyEntry) => string) => ({
        get: (key: string) => request(() => entries.find((entry) => entryKey(entry) === key)),
        put: (entry: VocabularyEntry) => request(() => {
          const index = entries.findIndex((other) => entryKey(other) === entryKey(entry));
          if (index >= 0) entries[index] = entry;
          else entries.push(entry);
        }),
        getAll: () => { calls.getAll += 1; return request(() => entries); },
        index: () => ({
          getAllKeys: (query: unknown) => {
            calls.getAllKeys.push(query);
            return request(() => entries.filter((entry) => entry.status === 'known').map(entryKey));
          },
          count: (query: unknown) => {
            calls.count.push(query);
            return request(() => entries.filter((entry) => entry.status === 'known').length);
          },
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
      });
      return transaction;
    },
  };
  return { database, calls, statistics, japaneseStatistics };
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

  it('merges known words idempotently while keeping the target’s mined contexts', async () => {
    const mined = entry('학생', 'unknown', true);
    const existing = entry('먹다', 'known');
    const { database, statistics } = fakeDatabase([mined, existing]);
    openDatabase.mockResolvedValue(database);
    const words = ['학생', '가다', '가다'.normalize('NFD')];

    await expect(markHeadwordsKnown(words)).resolves.toBe(2);
    await expect(markHeadwordsKnown(words)).resolves.toBe(0);
    await expect(listKnownHeadwords()).resolves.toEqual(['학생', '먹다', '가다']);
    const summary = await readVocabularySummary();
    expect(summary.minedEntries[0]).toMatchObject({
      headword: '학생', status: 'known', contexts: [{ sentence: mined.contexts[0]!.sentence }],
    });
    expect(statistics.get('baseline')).toMatchObject({ count: 3 });
  });

  it('keeps Japanese homographs separate and updates only Japanese history', async () => {
    const korean = { ...entry('먹다', 'known', true), ankiNoteId: 42 };
    const koreanFixture = [korean, ...Array.from({ length: 12_999 }, (_, index) => entry(`한국어${index}`, 'known'))];
    const { database, statistics, japaneseStatistics } = fakeDatabase(koreanFixture);
    const baseline = { at: 1_000, count: 13_000 };
    statistics.set('baseline', baseline);
    openDatabase.mockResolvedValue(database);
    const organism = { id: '1:せいぶつ', reading: 'せいぶつ', aliases: ['生物'] };
    const rawFood = { id: '2:なまもの', reading: 'なまもの', aliases: ['生物'] };
    await markJapaneseWordKnown('生物', organism);
    const message: Extract<VocabularyMessage, { type: 'mine-word' }> = {
      type: 'mine-word', language: 'ja', machineDefinitions: [],
      entry: { headword: '生物', originalForm: '生物', definitions: ['raw food'], koreanDefinitions: [], examples: [], japanese: rawFood },
      context: { sentence: '生物です。', originalForm: '生物', sourceTitle: '', sourceUrl: 'https://example.com', focusSpan: { start: 0, length: 2 } },
    };
    await expect(mineWord(message)).resolves.toBe('mined');
    await expect(mineWord(message)).resolves.toBe('existing');
    await expect(listKnownHeadwords('ja')).resolves.toEqual([organism.id, rawFood.id]);
    await expect(listKnownHeadwords()).resolves.toEqual(koreanFixture.map(({ headword }) => headword));
    await expect(getVocabulary(rawFood.id, 'ja')).resolves.toMatchObject({ contexts: [message.context] });
    await expect(getVocabulary('먹다')).resolves.toEqual(korean);
    expect([...statistics.entries()]).toEqual([['baseline', baseline]]);
    expect([...japaneseStatistics.values()].map(({ count }) => count)).toEqual([1, 2]);
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
