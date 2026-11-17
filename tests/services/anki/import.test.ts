import { afterEach, describe, expect, it, vi } from 'vitest';
import { previewKnownWords } from '@/services/anki/import';
import { DEFAULT_ANKI_SETTINGS } from '@/types/anki';
import { listVocabulary } from '@/services/storage/vocabulary';

vi.mock('@/services/storage/vocabulary', () => ({ listVocabulary: vi.fn() }));

describe('Anki known word preview', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads the selected deck, cleans and deduplicates focus words, and excludes already known entries', async () => {
    const settings = {
      ...DEFAULT_ANKI_SETTINGS,
      deckName: 'Sync deck',
      fields: { ...DEFAULT_ANKI_SETTINGS.fields, word: 'Korean' },
    };
    vi.mocked(listVocabulary).mockResolvedValue([
      { headword: '먹다', status: 'known' },
      { headword: '학생', status: 'unknown' },
    ] as Awaited<ReturnType<typeof listVocabulary>>);
    const note = (field: string, value: string, modelName = settings.modelName) =>
      ({ fields: { [field]: { value } }, modelName });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const { action, params } = JSON.parse(String(init?.body));
      if (action === 'findNotes') {
        expect(params).toEqual({ query: '"deck:Korean::Vocabulary"' });
        return Response.json({ result: [1, 2, 3, 4, 5, 6], error: null });
      }
      expect(action).toBe('notesInfo');
      expect(params.notes).toEqual([1, 2, 3, 4, 5, 6]);
      return Response.json({ error: null, result: [
        note('Focus Word', '<b>학생</b>&nbsp;[sound:student.mp3]'),
        note('Focus Word', '학생'.normalize('NFD')),
        note('Focus Word', '먹다'),
        note('Korean', '가다'),
        note('Korean', '이름', 'Unrelated'),
        note('Focus Word', '<br>'),
      ] });
    });

    await expect(previewKnownWords(settings, 'Korean::Vocabulary')).resolves.toEqual({
      headwords: ['학생', '가다'], alreadyKnown: 1, skipped: 2, total: 3,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports failed reads before making a preview', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(previewKnownWords(DEFAULT_ANKI_SETTINGS, 'Korean')).rejects.toThrow('Open Anki Desktop');
  });
});
