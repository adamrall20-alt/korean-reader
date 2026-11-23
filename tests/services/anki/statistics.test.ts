import { afterEach, describe, expect, it, vi } from 'vitest';
import { readDeckStatistics } from '@/services/anki/statistics';
import { listKnownHeadwords } from '@/services/storage/vocabulary';
import { DEFAULT_ANKI_SETTINGS } from '@/types/anki';

vi.mock('@/services/storage/vocabulary', () => ({ listKnownHeadwords: vi.fn() }));

describe('selected Anki deck statistics', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the saved deck ID and compares unique focus words with local vocabulary', async () => {
    const deckName = 'Korean::Vocabulary';
    const replies = {
      deckNamesAndIds: { [deckName]: 123, [deckName + '::Subdeck']: 222, Korean: 456 },
      getDeckStats: { 123: { name: 'Vocabulary', review_count: 42 } },
      findCards: [1, 2],
      findNotes: [1, 2, 3],
      notesInfo: ['먹다', '<b>먹다</b>', '학생'].map((value) => ({ fields: { 'Focus Word': { value } } })),
    };
    vi.mocked(listKnownHeadwords).mockResolvedValue(['먹다']);
    const requests = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const { action, params } = JSON.parse(String(init?.body)) as {
        action: keyof typeof replies | 'cardReviews'; params: { deck?: string };
      };
      if (action === 'getDeckStats') expect(params).toEqual({ decks: [deckName] });
      if (action === 'cardReviews') {
        expect(params).toMatchObject({ deck: expect.stringContaining(deckName), startID: 0 });
        const result = params.deck === deckName
          ? [[1, 2, 0, 3, 4, 5, 6, 750, 0], [2, 3, 0, 0, 4, 5, 6, 0, 4]]
          : [[3, 4, 0, 2, 4, 5, 6, 1250, 1]];
        return Response.json({ result, error: null });
      }
      if (action === 'findCards') {
        expect(params).toEqual({ query: '"deck:Korean::Vocabulary" is:review -is:suspended -is:learn prop:due>=1 prop:due<=7' });
      }
      return Response.json({ result: replies[action], error: null });
    });

    await expect(readDeckStatistics({ ...DEFAULT_ANKI_SETTINGS, deckName })).resolves.toEqual({
      deckName, reviewsToday: 42, reviewsNextWeek: 2, coverage: { knownWords: 1, totalWords: 2 },
      history: { totalReviews: 2, reviewMilliseconds: 2000 },
    });
    expect(requests).toHaveBeenCalledTimes(7);
  });

  it('keeps review counts and study time when coverage and the seven-day search fail', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const { action } = JSON.parse(String(init?.body)) as { action: string };
      if (action === 'deckNamesAndIds') return Response.json({ result: { Korean: 123 }, error: null });
      if (action === 'getDeckStats') return Response.json({ result: { 123: { review_count: 0 } }, error: null });
      if (action === 'cardReviews') return Response.json({ result: [], error: null });
      return Response.json({ result: null, error: 'Search failed' });
    });

    await expect(readDeckStatistics({ ...DEFAULT_ANKI_SETTINGS, deckName: 'Korean' })).resolves.toEqual({
      deckName: 'Korean', reviewsToday: 0, reviewsNextWeek: null, coverage: null,
      history: { totalReviews: 0, reviewMilliseconds: 0 },
    });
  });

  it('skips requests until a deck is configured and reports connection failures', async () => {
    const requests = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(readDeckStatistics(DEFAULT_ANKI_SETTINGS)).resolves.toBeNull();
    expect(requests).not.toHaveBeenCalled();
    await expect(readDeckStatistics({ ...DEFAULT_ANKI_SETTINGS, deckName: 'Korean' })).rejects.toThrow('Open Anki Desktop');
  });
});
