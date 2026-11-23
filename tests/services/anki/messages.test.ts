import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { handleAnkiMessage, isAnkiMessage } from '@/services/anki/messages';
import { ANKI_DEFAULT_FIELDS, DEFAULT_ANKI_SETTINGS } from '@/types/anki';

const { get, set } = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('wxt/browser', () => ({ browser: { storage: { local: { get, set } } } }));

const korean = { ...DEFAULT_ANKI_SETTINGS, deckName: 'Korean', apiKey: 'example-key' };
const japanese = {
  ...DEFAULT_ANKI_SETTINGS, deckName: 'Japanese Mining', modelName: 'Japanese Sentence',
  fields: { ...ANKI_DEFAULT_FIELDS, pronunciation: 'Reading' }, port: 8766, apiKey: 'shared-key',
};
let storage: Record<string, unknown>;

beforeEach(() => {
  storage = { ankiSettings: korean };
  get.mockReset().mockImplementation(async () => structuredClone(storage));
  set.mockReset().mockImplementation(async (writes) => { Object.assign(storage, structuredClone(writes)); });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const { action } = JSON.parse(String(init?.body));
    const results: Record<string, unknown> = {
      deckNames: ['Korean', 'Japanese Mining', 'Languages', 'Languages::Japanese'],
      modelNames: [korean.modelName, japanese.modelName],
      modelFieldNames: [...Object.values(ANKI_DEFAULT_FIELDS), 'Reading'],
    };
    return Response.json({ result: results[action], error: null });
  });
});

afterEach(() => vi.restoreAllMocks());

it('keeps legacy Korean settings and saves a separate Japanese mapping on the shared connection', async () => {
  await expect(handleAnkiMessage({ type: 'get-anki-settings' })).resolves.toEqual({ ok: true, settings: korean });
  await expect(handleAnkiMessage({ type: 'get-anki-settings', language: 'ja' })).resolves.toMatchObject({
    ok: true, settings: { deckName: '', modelName: '', apiKey: korean.apiKey, port: korean.port },
  });
  await handleAnkiMessage({ type: 'save-anki-settings', language: 'ja', settings: japanese });
  await expect(handleAnkiMessage({ type: 'get-anki-settings', language: 'ja' })).resolves.toEqual({ ok: true, settings: japanese });
  await expect(handleAnkiMessage({ type: 'get-anki-settings' })).resolves.toEqual({
    ok: true, settings: { ...korean, apiKey: japanese.apiKey, port: japanese.port },
  });
  expect(storage.japaneseAnkiProfile).not.toHaveProperty('apiKey');
  expect(storage.japaneseAnkiProfile).not.toHaveProperty('port');
});

it('rejects overlapping deck choices even when saves arrive together', async () => {
  const saved = handleAnkiMessage({ type: 'save-anki-settings', settings: { ...korean, deckName: 'Languages' } });
  const rejected = handleAnkiMessage({ type: 'save-anki-settings', language: 'ja', settings: {
    ...japanese, deckName: 'Languages::Japanese',
  } });
  await expect(Promise.allSettled([saved, rejected])).resolves.toMatchObject([
    { status: 'fulfilled' }, { status: 'rejected', reason: { message: expect.stringContaining('Choose separate') } },
  ]);
  expect(set).toHaveBeenCalledTimes(1);
  await expect(handleAnkiMessage({ type: 'save-anki-settings', language: 'ja', settings: japanese })).resolves.toEqual({ ok: true });
});

it('reserves the Japanese deck from Korean sync and rejects Japanese sync while gated', async () => {
  await handleAnkiMessage({ type: 'save-anki-settings', language: 'ja', settings: japanese });
  const sync = { type: 'sync-anki', settings: { ...korean, deckName: japanese.deckName }, translations: [] } as const;
  expect(isAnkiMessage({ ...sync, language: 'ja' })).toBe(false);
  await expect(handleAnkiMessage({ ...sync, translations: [] })).rejects.toThrow('Choose separate');
});
