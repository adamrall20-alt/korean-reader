import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { countUnsynced, syncVocabulary } from '@/services/anki/sync';
import type { AnkiNote, AnkiNoteInfo } from '@/services/anki/client';
import { ANKI_DEFAULT_FIELDS, DEFAULT_ANKI_SETTINGS, JAPANESE_ANKI_ID_FIELD, JAPANESE_ANKI_MODEL } from '@/types/anki';
import type { VocabularyEntry } from '@/types/vocabulary';

const { getVocabulary, listVocabulary, recordAnkiSync } = vi.hoisted(() => ({
  getVocabulary: vi.fn(), listVocabulary: vi.fn(), recordAnkiSync: vi.fn(),
}));
vi.mock('@/services/storage/vocabulary', () => ({ getVocabulary, listVocabulary, recordAnkiSync }));

const profile = { ...DEFAULT_ANKI_SETTINGS, deckName: 'Japanese Mining', modelName: JAPANESE_ANKI_MODEL };
const id = '1234567:せいぶつ';
const otherId = '1234567:なまもの';
const sentence = '生物と生物です。';
const entry: VocabularyEntry = {
  headword: '生物', originalForm: '生物', definitions: ['organism'], koreanDefinitions: [], examples: [],
  japanese: { id, aliases: ['生物'], reading: 'せいぶつ' },
  contexts: [{ sentence, originalForm: '生物', focusSpan: { start: 3, length: 2 },
    sourceUrl: 'https://example.com/', sourceTitle: 'Text', minedAt: '' }],
  status: 'known', createdAt: '', updatedAt: '',
};

function collection() {
  const notes = new Map<number, AnkiNoteInfo>();
  const deckByCard = new Map<number, string>();
  const written: AnkiNote[] = [];
  const update = vi.fn();
  const search = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const { action, params } = JSON.parse(String(init?.body));
    let result: unknown;
    switch (action) {
      case 'deckNames': result = [profile.deckName]; break;
      case 'modelNames': result = [profile.modelName, 'Custom']; break;
      case 'modelFieldNames': result = [...Object.values(ANKI_DEFAULT_FIELDS), JAPANESE_ANKI_ID_FIELD]; break;
      case 'findNotes':
        search(params.query);
        result = [...notes.values()].filter((note) => note.cards?.some((card) => deckByCard.get(card)?.startsWith(profile.deckName))).map((note) => note.noteId); break;
      case 'notesInfo': result = (params.notes as number[]).map((note) => notes.get(note)); break;
      case 'cardsInfo': result = (params.cards as number[]).map((cardId) => ({ cardId, deckName: deckByCard.get(cardId) })); break;
      case 'addNote': {
        const created = params.note as AnkiNote;
        written.push(created);
        const noteId = Math.max(0, ...notes.keys()) + 1;
        notes.set(noteId, { noteId, tags: created.tags, modelName: created.modelName, cards: [noteId],
          fields: Object.fromEntries(Object.entries(created.fields).map(([field, value]) => [field, { value }])) });
        deckByCard.set(noteId, created.deckName);
        result = noteId;
        break;
      }
      case 'updateNoteFields': {
        update(params.note);
        const note = notes.get(params.note.id)!;
        for (const [name, value] of Object.entries(params.note.fields)) note.fields[name] = { value: String(value) };
        result = null;
        break;
      }
      default: throw new Error(action);
    }
    return Response.json({ result, error: null });
  });
  return { written, notes, deckByCard, search, update };
}

describe('Japanese Anki sync', () => {
  beforeEach(() => {
    getVocabulary.mockReset().mockImplementation(async (key) => key === otherId
      ? { ...entry, japanese: { ...entry.japanese, id: otherId, reading: 'なまもの' }, definitions: ['raw food'] }
      : entry);
    listVocabulary.mockReset().mockResolvedValue([entry]);
    recordAnkiSync.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('makes distinct cards for the same kanji, highlights the selected span and retries without duplicating', async () => {
    const { written, search, update } = collection();
    await expect(countUnsynced(profile, 'ja')).resolves.toBe(1);
    await expect(syncVocabulary(profile, [id, otherId], 'ja')).resolves.toMatchObject([{ status: 'created' }, { status: 'created' }]);
    expect(written.map((note) => [note.deckName, note.fields[JAPANESE_ANKI_ID_FIELD], note.fields.Pronunciation])).toEqual([
      [profile.deckName, id, 'せいぶつ'], [profile.deckName, otherId, 'なまもの'],
    ]);
    expect(written[0]?.fields.Sentence).toBe('生物と<span style="color: #f59e0b">生物</span>です。');
    expect(written[0]?.options.allowDuplicate).toBe(false);
    expect(search).toHaveBeenCalledWith(expect.stringContaining('"deck:Japanese Mining" ('));
    expect(recordAnkiSync).toHaveBeenCalledWith(id, 1, 'Focus Word', 'ja');
    await expect(countUnsynced(profile, 'ja')).resolves.toBe(0);
    const second = { ...entry, contexts: [...entry.contexts, { ...entry.contexts[0]!, sentence: '生物は違う。', focusSpan: { start: 0, length: 2 } }] };
    getVocabulary.mockResolvedValue(second);
    listVocabulary.mockResolvedValue([second]);
    await expect(countUnsynced(profile, 'ja')).resolves.toBe(1);
    await expect(syncVocabulary(profile, [id], 'ja')).resolves.toMatchObject([{ status: 'updated' }]);
    await expect(syncVocabulary(profile, [id], 'ja')).resolves.toMatchObject([{ status: 'existing' }]);
    expect(update).toHaveBeenCalledTimes(1);
    expect(written).toHaveLength(2);
  });

  it('refuses to edit a note whose cards span the Japanese and Korean decks', async () => {
    const { written, notes, deckByCard, update } = collection();
    await syncVocabulary(profile, [id], 'ja');
    notes.get(1)!.cards = [1, 2];
    deckByCard.set(2, 'Korean');
    await expect(syncVocabulary(profile, [id], 'ja')).resolves.toMatchObject([
      { status: 'failed', message: expect.stringContaining('outside the selected deck') },
    ]);
    expect(update).not.toHaveBeenCalled();
    expect(written).toHaveLength(1);
  });

  it('uses a scoped duplicate exception for two confirmed readings with a custom note type', async () => {
    const { written } = collection();
    const custom = { ...profile, modelName: 'Custom' };
    await expect(syncVocabulary(custom, [id, otherId], 'ja')).resolves.toMatchObject([{ status: 'created' }, { status: 'created' }]);
    expect(written.map(({ options }) => options.allowDuplicate)).toEqual([false, true]);
  });
});
