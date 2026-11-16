import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANKI_DEFAULT_FIELDS, DEFAULT_ANKI_SETTINGS } from '@/types/anki';
import type { VocabularyEntry } from '@/types/vocabulary';
import { syncVocabulary } from '@/services/anki/sync';

const { getVocabulary, recordAnkiSync } = vi.hoisted(() => ({
  getVocabulary: vi.fn(),
  recordAnkiSync: vi.fn(),
}));
vi.mock('@/services/storage/vocabulary', () => ({ getVocabulary, recordAnkiSync }));

const settings = { ...DEFAULT_ANKI_SETTINGS, deckName: 'Korean' };
const word: VocabularyEntry = {
  headword: '먹다', originalForm: '먹어요', definitions: ['to eat'], koreanDefinitions: [],
  examples: [], status: 'known', createdAt: '', updatedAt: '',
  contexts: [{
    originalForm: '먹어요', sentence: '밥을 <먹어요> & 물을 마셔요.',
    sourceTitle: 'Video', sourceUrl: 'https://www.youtube.com/watch?v=abc', minedAt: '',
  }],
};

type RequestHandler = (action: string, params: Record<string, unknown>) => unknown;

function fakeAnki(handler: RequestHandler) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const { action, params } = JSON.parse(String(init?.body));
    const setup: Record<string, unknown> = {
      deckNames: ['Korean'],
      modelNames: [settings.modelName],
      modelFieldNames: Object.values(ANKI_DEFAULT_FIELDS),
    };
    const result = action in setup ? setup[action] : handler(action, params);
    return Response.json({ result, error: null });
  });
}

describe('Anki sync', () => {
  beforeEach(() => {
    getVocabulary.mockReset().mockImplementation(async (headword) => ({ ...word, headword }));
    recordAnkiSync.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('creates one safely formatted note and records its ID', async () => {
    const calls = vi.fn((action: string) => {
      switch (action) {
        case 'findNotes': return [];
        case 'canAddNotes': return [true];
        case 'addNote': return 17;
        default: throw new Error(action);
      }
    });
    fakeAnki(calls);

    await expect(syncVocabulary(settings, ['먹다', '먹다'])).resolves.toEqual([
      { headword: '먹다', status: 'created' },
    ]);
    expect(calls).toHaveBeenCalledWith('addNote', {
      note: {
        deckName: 'Korean',
        modelName: 'Kimchi Sentence Mining',
        fields: {
          'Focus Word': '먹다',
          Sentence: '밥을 &lt;<span style="color: #f59e0b">먹어요</span>&gt; &amp; 물을 마셔요.',
          Definition: 'to eat',
          Pronunciation: '',
          Audio: '',
          Image: '',
        },
        options: { allowDuplicate: false },
        tags: ['korean-reader', expect.stringMatching(/^kr-word-/)],
      },
    });
    expect(recordAnkiSync).toHaveBeenCalledExactlyOnceWith('먹다', 17, 'Focus Word');
  });

  it('appends a missing sentence to an existing note and skips a repeated sync', async () => {
    let sentence = '<b>기존 문장.</b>';
    const calls = vi.fn((action: string, params) => {
      switch (action) {
        case 'findNotes': return [21];
        case 'notesInfo': return [{
          noteId: 21, modelName: settings.modelName,
          fields: { 'Focus Word': { value: '먹다' }, Sentence: { value: sentence } },
        }];
        case 'updateNoteFields':
          expect(params.note.fields).toEqual({ Sentence: expect.stringContaining('<b>기존 문장.</b><br>') });
          sentence = params.note.fields.Sentence;
          return null;
        default: throw new Error(action);
      }
    });
    fakeAnki(calls);

    await expect(syncVocabulary(settings, ['먹다'])).resolves.toEqual([{ headword: '먹다', status: 'updated' }]);
    await expect(syncVocabulary(settings, ['먹다'])).resolves.toEqual([{ headword: '먹다', status: 'existing' }]);
    expect(calls.mock.calls.filter(([action]) => action === 'updateNoteFields')).toHaveLength(1);
    expect(calls).toHaveBeenCalledWith('findNotes', { query: expect.stringContaining('"Focus Word:먹다"') });
  });

  it('reports partial failures from bulk creation', async () => {
    fakeAnki((action) => {
      switch (action) {
        case 'findNotes': return [];
        case 'canAddNotes': return [true, false, true];
        case 'addNotes': return [21, null];
        default: throw new Error(action);
      }
    });

    const results = await syncVocabulary(settings, ['먹다', '가다', '오다']);
    expect(results).toEqual(expect.arrayContaining([
      { headword: '먹다', status: 'created' },
      { headword: '가다', status: 'failed', message: expect.stringContaining('rejected') },
      { headword: '오다', status: 'failed', message: expect.stringContaining('note ID') },
    ]));
    expect(recordAnkiSync).toHaveBeenCalledTimes(1);
  });

  it('refuses to create a note when matching notes already exist', async () => {
    const calls = vi.fn((action: string) => {
      if (action === 'findNotes') return [1, 2];
      if (action === 'notesInfo') return [1, 2].map((noteId) => ({
        noteId, modelName: settings.modelName,
        fields: { 'Focus Word': { value: '먹다' } },
      }));
      throw new Error(action);
    });
    fakeAnki(calls);
    await expect(syncVocabulary(settings, ['먹다'])).resolves.toEqual([
      { headword: '먹다', status: 'failed', message: expect.stringContaining('Multiple existing') },
    ]);
    expect(calls.mock.calls.map(([action]) => action)).toEqual(['findNotes', 'notesInfo']);
  });

  it('reports a connection failure before reading or writing notes', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(syncVocabulary(settings, ['먹다'])).rejects.toThrow('Open Anki Desktop');
    expect(getVocabulary).not.toHaveBeenCalled();
  });
});
