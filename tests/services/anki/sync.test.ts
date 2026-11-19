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
          Definition: '먹다 = to eat',
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

  it('fills empty Audio on an existing note and preserves it on repeat sync', async () => {
    getVocabulary.mockResolvedValue({
      ...word, contexts: [{ ...word.contexts[0], audio: 'data:audio/webm;base64,YWJj' }],
    });
    let audio = '';
    const calls = vi.fn((action: string, params) => {
      switch (action) {
        case 'findNotes': return [21];
        case 'notesInfo': return [{
          noteId: 21, modelName: settings.modelName,
          fields: {
            'Focus Word': { value: '먹다' },
            Sentence: { value: '밥을 &lt;먹어요&gt; &amp; 물을 마셔요.' },
            Audio: { value: audio },
          },
        }];
        case 'storeMediaFile': return 'stored-clip.webm';
        case 'updateNoteFields':
          expect(params.note.fields).toEqual({ Audio: '[sound:stored-clip.webm]' });
          audio = params.note.fields.Audio;
          return null;
        default: throw new Error(action);
      }
    });
    fakeAnki(calls);

    await expect(syncVocabulary(settings, ['먹다'])).resolves.toEqual([{ headword: '먹다', status: 'updated' }]);
    await expect(syncVocabulary(settings, ['먹다'])).resolves.toEqual([{ headword: '먹다', status: 'existing' }]);
    expect(calls).toHaveBeenCalledWith('storeMediaFile', {
      filename: expect.stringMatching(/^korean-reader-[a-f0-9]{64}\.webm$/), data: 'YWJj',
    });
    expect(calls.mock.calls.filter(([action]) => action === 'storeMediaFile')).toHaveLength(1);
  });

  it('creates the note if audio upload fails and attaches audio to a new note when it succeeds', async () => {
    getVocabulary.mockResolvedValue({
      ...word, contexts: [{ ...word.contexts[0], audio: 'data:audio/webm;base64,YWJj' }],
    });
    let uploadFails = true;
    const calls = vi.fn((action: string) => {
      switch (action) {
        case 'findNotes': return [];
        case 'storeMediaFile': return uploadFails ? null : 'stored-clip.webm';
        case 'canAddNotes': return [true];
        case 'addNote': return 17;
        default: throw new Error(action);
      }
    });
    fakeAnki(calls);

    await expect(syncVocabulary(settings, ['먹다'])).resolves.toEqual([
      { headword: '먹다', status: 'created', message: expect.stringContaining('Sync again to retry') },
    ]);
    expect(calls).toHaveBeenLastCalledWith('addNote', {
      note: expect.objectContaining({ fields: expect.objectContaining({ Audio: '' }) }),
    });

    uploadFails = false;
    await expect(syncVocabulary(settings, ['먹다'])).resolves.toEqual([{ headword: '먹다', status: 'created' }]);
    expect(calls).toHaveBeenLastCalledWith('addNote', {
      note: expect.objectContaining({ fields: expect.objectContaining({ Audio: '[sound:stored-clip.webm]' }) }),
    });
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
      note: { id: 21, fields: { Definition: '먹다 = to eat<br>음식을 먹다.' } },
    });
  });

  it('formats English definitions in Kimchi Reader style, omits Korean definitions, escapes HTML, and avoids double prefixing', async () => {
    getVocabulary.mockResolvedValueOnce({
      ...word,
      headword: '비유',
      originalForm: '비유',
      definitions: [
        'analogy; being figurative; metaphor: An act of explaining one thing effectively by comparing it with another thing that shares similarities, or such a method of explanation.',
        '비유 = already <prefixed> & safe"',
      ],
      koreanDefinitions: ['사물의 현상을 비슷한 다른 것에 빗대어 설명하는 일.'],
      contexts: [{ ...word.contexts[0]!, originalForm: '비유', sentence: '비유를 사용하다.' }],
    });
    const calls = vi.fn((action: string) => {
      switch (action) {
        case 'findNotes': return [];
        case 'canAddNotes': return [true];
        case 'addNote': return 42;
        default: throw new Error(action);
      }
    });
    fakeAnki(calls);

    await expect(syncVocabulary(settings, ['비유'])).resolves.toEqual([{ headword: '비유', status: 'created' }]);
    expect(calls).toHaveBeenCalledWith('addNote', {
      note: expect.objectContaining({
        fields: expect.objectContaining({
          'Focus Word': '비유',
          Definition:
            '비유 = analogy; being figurative; metaphor: An act of explaining one thing effectively by comparing it with another thing that shares similarities, or such a method of explanation.<br>비유 = already &lt;prefixed&gt; &amp; safe&quot;',
        }),
      }),
    });
  });

  it('keeps Korean-only definitions unprefixed when no English exists and upgrades the note once English is available', async () => {
    getVocabulary.mockResolvedValueOnce({
      ...word,
      definitions: [],
      machineDefinitions: [],
      koreanDefinitions: ['음식을 먹다.'],
    });
    let definition = '';
    let existingId: number[] = [];
    const calls = vi.fn((action: string, params: Record<string, any>) => {
      switch (action) {
        case 'findNotes': return existingId;
        case 'canAddNotes': return [true];
        case 'addNote':
          definition = params.note.fields.Definition;
          existingId = [21];
          return 21;
        case 'notesInfo':
          return [{
            noteId: 21,
            modelName: settings.modelName,
            fields: {
              'Focus Word': { value: '먹다' },
              Sentence: { value: '밥을 &lt;<span style="color: #f59e0b">먹어요</span>&gt; &amp; 물을 마셔요.' },
              Definition: { value: definition },
            },
          }];
        case 'updateNoteFields':
          definition = params.note.fields.Definition;
          return null;
        default: throw new Error(action);
      }
    });
    fakeAnki(calls);

    await expect(syncVocabulary(settings, ['먹다'])).resolves.toEqual([{ headword: '먹다', status: 'created' }]);
    expect(definition).toBe('음식을 먹다.');

    getVocabulary.mockResolvedValueOnce({
      ...word,
      definitions: ['to eat'],
      koreanDefinitions: ['음식을 먹다.'],
    });
    await expect(syncVocabulary(settings, ['먹다'])).resolves.toEqual([{ headword: '먹다', status: 'updated' }]);
    expect(definition).toBe('먹다 = to eat');
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

  it('batches duplicate checks into one lookup across mixed existing, new, and conflicted words', async () => {
    const wordTag = (text: string) =>
      'kr-word-' + Array.from(text, (ch) => ch.codePointAt(0)!.toString(16)).join('-');
    const entries: Record<string, VocabularyEntry> = {
      먹다: word,
      가다: { ...word, headword: '가다', originalForm: '가요', contexts: [{ ...word.contexts[0]!, sentence: '집에 가요.' }] },
      오다: { ...word, headword: '오다', originalForm: '와요', contexts: [{ ...word.contexts[0]!, sentence: '친구가 와요.' }] },
      보다: { ...word, headword: '보다', originalForm: '봐요', contexts: [{ ...word.contexts[0]!, sentence: '영화를 봐요.' }] },
      자다: { ...word, headword: '자다', originalForm: '자요', contexts: [{ ...word.contexts[0]!, sentence: '일찍 자요.' }] },
    };
    getVocabulary.mockImplementation(async (headword: string) => entries[headword]);

    let updatedSentence = '<b>기존 문장.</b>';
    const calls = vi.fn((action: string, params: Record<string, any>) => {
      switch (action) {
        case 'findNotes':
          return [101, 102, 103, 104, 105];
        case 'notesInfo':
          if (params.notes.length === 1 && params.notes[0] === 101) {
            return [{
              noteId: 101,
              modelName: settings.modelName,
              fields: { 'Focus Word': { value: '먹다' }, Sentence: { value: updatedSentence } },
            }];
          }
          return [
            {
              noteId: 101,
              modelName: settings.modelName,
              fields: { 'Focus Word': { value: '먹다' }, Sentence: { value: updatedSentence } },
            },
            {
              noteId: 102,
              modelName: settings.modelName,
              fields: {
                'Focus Word': { value: '가다' },
                Sentence: { value: '집에 가요.' },
                Definition: { value: 'to eat' },
              },
            },
            {
              noteId: 103,
              modelName: settings.modelName,
              fields: { 'Focus Word': { value: '다른단어' } },
              tags: [wordTag('보다')],
            },
            {
              noteId: 104,
              modelName: settings.modelName,
              fields: { 'Focus Word': { value: '자다' } },
            },
            {
              noteId: 105,
              modelName: settings.modelName,
              fields: { 'Focus Word': { value: '자다' } },
            },
          ];
        case 'updateNoteFields':
          updatedSentence = params.note.fields.Sentence;
          return null;
        case 'canAddNotes':
          return [true];
        case 'addNote':
          return 200;
        default:
          throw new Error(action);
      }
    });
    fakeAnki(calls);

    const results = await syncVocabulary(settings, ['먹다', '가다', '오다', '보다', '자다']);
    expect(calls.mock.calls.filter(([action]) => action === 'findNotes')).toHaveLength(1);
    expect(calls).toHaveBeenCalledWith('notesInfo', { notes: [101, 102, 103, 104, 105] });
    expect(results).toEqual(expect.arrayContaining([
      { headword: '먹다', status: 'updated' },
      { headword: '가다', status: 'existing' },
      { headword: '오다', status: 'created' },
      { headword: '보다', status: 'failed', message: expect.stringContaining('previously synced note') },
      { headword: '자다', status: 'failed', message: expect.stringContaining('Multiple existing') },
    ]));
  });

  it('splits large syncs into batches of 20 and isolates failed lookup batches', async () => {
    const headwords = Array.from({ length: 25 }, (_, index) => `단어${index}`);
    getVocabulary.mockImplementation(async (headword: string) => ({
      ...word,
      headword,
      contexts: [{ ...word.contexts[0]!, sentence: `${headword} 문장.` }],
    }));

    let findBatch = 0;
    const calls = vi.fn((action: string, params: Record<string, unknown>) => {
      if (action === 'findNotes') {
        findBatch += 1;
        if (findBatch === 1) throw new Error('Batch lookup timeout');
        return [];
      }
      if (action === 'canAddNotes') {
        return (params.notes as unknown[]).map(() => true);
      }
      if (action === 'addNotes') {
        return (params.notes as unknown[]).map((_, index) => 300 + index);
      }
      throw new Error(action);
    });
    fakeAnki(calls);

    const results = await syncVocabulary(settings, headwords);
    const findCalls = calls.mock.calls.filter(([action]) => action === 'findNotes');
    expect(findCalls).toHaveLength(2);
    expect(findCalls[0]![1]).toEqual({ query: expect.stringContaining('"Focus Word:단어19"') });
    expect(findCalls[0]![1]).not.toEqual({ query: expect.stringContaining('"Focus Word:단어20"') });
    expect(findCalls[1]![1]).toEqual({ query: expect.stringContaining('"Focus Word:단어24"') });

    for (let index = 0; index < 20; index += 1) {
      expect(results).toContainEqual({
        headword: `단어${index}`,
        status: 'failed',
        message: expect.stringContaining('Could not reach AnkiConnect'),
      });
    }
    for (let index = 20; index < 25; index += 1) {
      expect(results).toContainEqual({ headword: `단어${index}`, status: 'created' });
    }
  });
});
