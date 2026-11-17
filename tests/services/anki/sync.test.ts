import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANKI_DEFAULT_FIELDS, DEFAULT_ANKI_SETTINGS } from '@/types/anki';
import type { VocabularyEntry } from '@/types/vocabulary';
import { countUnsynced, syncVocabulary } from '@/services/anki/sync';

const { getVocabulary, listVocabulary, recordAnkiSync } = vi.hoisted(() => ({
  getVocabulary: vi.fn(),
  listVocabulary: vi.fn(),
  recordAnkiSync: vi.fn(),
}));
vi.mock('@/services/storage/vocabulary', () => ({ getVocabulary, listVocabulary, recordAnkiSync }));

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

  it('uploads a captured frame and includes it in the new note', async () => {
    getVocabulary.mockResolvedValue({ ...word, contexts: [{ ...word.contexts[0], image: 'data:image/jpeg;base64,YWJj' }] });
    const calls = vi.fn((action: string, params: Record<string, any>) => {
      switch (action) {
        case 'findNotes': return [];
        case 'storeMediaFile': return params.filename;
        case 'canAddNotes': return [true];
        case 'addNote': return 17;
        default: throw new Error(action);
      }
    });
    fakeAnki(calls);
    await expect(syncVocabulary(settings, ['먹다'])).resolves.toEqual([{ headword: '먹다', status: 'created' }]);
    expect(calls).toHaveBeenCalledWith('storeMediaFile', { filename: expect.stringMatching(/^korean-reader-.*\.jpg$/), data: 'YWJj' });
    expect(calls).toHaveBeenCalledWith('addNote', { note: expect.objectContaining({ fields: expect.objectContaining({ Image: expect.stringMatching(/^<img src="korean-reader-.*\.jpg">$/) }) }) });
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

  it('counts only headwords missing from the Anki collection', async () => {
    listVocabulary.mockResolvedValueOnce([word, { ...word, headword: '가다' }, { ...word, headword: '이다', contexts: [] }]);
    fakeAnki((action) => {
      if (action === 'findNotes') return [21];
      if (action === 'notesInfo') return [{
        noteId: 21, modelName: settings.modelName, fields: { 'Focus Word': { value: '먹다' } },
      }];
      throw new Error(action);
    });
    await expect(countUnsynced(settings)).resolves.toBe(1);
  });

  it('never syncs an imported word without a mined sentence', async () => {
    getVocabulary.mockResolvedValueOnce({ ...word, contexts: [] });
    const calls = vi.fn();
    fakeAnki(calls);
    await expect(syncVocabulary(settings, ['먹다'])).resolves.toEqual([]);
    expect(calls).not.toHaveBeenCalled();
    expect(recordAnkiSync).not.toHaveBeenCalled();
  });

  it('adds saved English to a previously synced Korean-only definition', async () => {
    getVocabulary.mockResolvedValueOnce({
      ...word, definitions: [], machineDefinitions: ['to eat'], koreanDefinitions: ['음식을 먹다.'],
    });
    let definition = '음식을 먹다.';
    const calls = vi.fn((action: string, params) => {
      if (action === 'findNotes') return [21];
      if (action === 'notesInfo') return [{
        noteId: 21, modelName: settings.modelName,
        fields: {
          'Focus Word': { value: '먹다' },
          Sentence: { value: '밥을 &lt;먹어요&gt; &amp; 물을 마셔요.' },
          Definition: { value: definition },
        },
      }];
      if (action === 'updateNoteFields') {
        definition = params.note.fields.Definition;
        return null;
      }
      throw new Error(action);
    });
    fakeAnki(calls);

    await expect(syncVocabulary(settings, ['먹다'])).resolves.toEqual([{ headword: '먹다', status: 'updated' }]);
    expect(calls).toHaveBeenCalledWith('updateNoteFields', {
      note: { id: 21, fields: { Definition: 'to eat<br>음식을 먹다.' } },
    });
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
