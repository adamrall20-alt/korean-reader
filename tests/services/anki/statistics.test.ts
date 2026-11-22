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
      cardReviews: [[1, 2, 0, 3, 4, 5, 6, 750, 0], [2, 3, 0, 0, 4, 5, 6, 0, 4]],
      findCards: [1, 2],
      findNotes: [1, 2, 3],
      notesInfo: ['먹다', '<b>먹다</b>', '학생'].map((value) => ({ fields: { 'Focus Word': { value } } })),
    };
    vi.mocked(listKnownHeadwords).mockResolvedValue(['먹다']);
    const requests = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const { action, params } = JSON.parse(String(init?.body)) as { action: keyof typeof replies; params: unknown };
      if (action === 'getDeckStats') expect(params).toEqual({ decks: [deckName] });
      if (action === 'cardReviews') expect(params).toMatchObject({ deck: expect.stringContaining(deckName), startID: 0 });
      if (action === 'findCards') {
        expect(params).toEqual({ query: '"deck:Korean::Vocabulary" is:review -is:suspended -is:learn prop:due>=1 prop:due<=7' });
      }
      return Response.json({ result: replies[action], error: null });
    });

    await expect(readDeckStatistics({ ...DEFAULT_ANKI_SETTINGS, deckName })).resolves.toEqual({
      deckName, reviewsToday: 42, reviewsNextWeek: 2, knownWords: 1, totalWords: 2, history: { totalReviews: 2, reviewMilliseconds: 1500 },
    });
    expect(requests).toHaveBeenCalledTimes(7);
  });

  it('skips requests until a deck is configured and reports connection failures', async () => {
    const requests = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(readDeckStatistics(DEFAULT_ANKI_SETTINGS)).resolves.toBeNull();
    expect(requests).not.toHaveBeenCalled();
    await expect(readDeckStatistics({ ...DEFAULT_ANKI_SETTINGS, deckName: 'Korean' })).rejects.toThrow('Open Anki Desktop');
  });
});
