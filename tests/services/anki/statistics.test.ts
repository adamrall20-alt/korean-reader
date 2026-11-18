import { afterEach, describe, expect, it, vi } from 'vitest';
import { readDeckStatistics } from '@/services/anki/statistics';
import { listVocabulary } from '@/services/storage/vocabulary';
import { DEFAULT_ANKI_SETTINGS } from '@/types/anki';

vi.mock('@/services/storage/vocabulary', () => ({ listVocabulary: vi.fn() }));

describe('selected Anki deck statistics', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the saved deck ID and compares unique focus words with local vocabulary', async () => {
    const deckName = 'Korean::Vocabulary';
    const replies = {
      deckNamesAndIds: { [deckName]: 123, Korean: 456 },
      getDeckStats: { 123: { name: 'Vocabulary', review_count: 42 } },
      findCards: [1, 2],
      findNotes: [1, 2, 3],
      notesInfo: ['먹다', '<b>먹다</b>', '학생'].map((value) => ({ fields: { 'Focus Word': { value } } })),
    };
    vi.mocked(listVocabulary).mockResolvedValue([{ headword: '먹다', status: 'known' }] as Awaited<ReturnType<typeof listVocabulary>>);
    const requests = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const { action, params } = JSON.parse(String(init?.body)) as { action: keyof typeof replies; params: unknown };
      if (action === 'getDeckStats') expect(params).toEqual({ decks: [deckName] });
      if (action === 'findCards') {
        expect(params).toEqual({ query: '"deck:Korean::Vocabulary" is:review -is:suspended -is:learn prop:due>=1 prop:due<=7' });
      }
      return Response.json({ result: replies[action], error: null });
    });

    await expect(readDeckStatistics({ ...DEFAULT_ANKI_SETTINGS, deckName })).resolves.toEqual({
      deckName, reviewsToday: 42, reviewsNextWeek: 2, knownWords: 1, totalWords: 2,
    });
    expect(requests).toHaveBeenCalledTimes(5);
  });

  it('skips requests until a deck is configured and reports connection failures', async () => {
    const requests = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(readDeckStatistics(DEFAULT_ANKI_SETTINGS)).resolves.toBeNull();
    expect(requests).not.toHaveBeenCalled();
    await expect(readDeckStatistics({ ...DEFAULT_ANKI_SETTINGS, deckName: 'Korean' })).rejects.toThrow('Open Anki Desktop');
  });
});
