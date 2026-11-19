import { DEFAULT_SUBTITLE_APPEARANCE } from '@/types/preferences';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const { listeners, getVocabulary, markHeadwordsKnown, setStorage, listKnownHeadwords, changeVocabulary, listVocabulary } = vi.hoisted(() => ({
  getVocabulary: vi.fn(),
  listKnownHeadwords: vi.fn(),
  changeVocabulary: vi.fn(),
  listVocabulary: vi.fn(),
  markHeadwordsKnown: vi.fn(),
  setStorage: vi.fn().mockResolvedValue(undefined),
  listeners: {
    installed: [] as Array<(...args: unknown[]) => void>,
    message: [] as Array<(...args: unknown[]) => boolean | undefined>,
  },
}));

vi.mock('@/services/storage/vocabulary', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/storage/vocabulary')>(),
  getVocabulary,
  markHeadwordsKnown,
  listKnownHeadwords,
  changeVocabulary,
  listVocabulary,
}));

vi.mock('@/services/dictionary/frequency', () => ({ frequencyRank: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@/services/dictionary/cache', () => ({
  getCachedDictionaryEntry: vi.fn(),
  cacheDictionaryEntry: vi.fn(),
  clearDictionaryCache: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    storage: { local: { get: async () => ({ krDictApiKey: 'test-key' }), set: setStorage } },
    runtime: {
      getURL: (path: string) => `chrome-extension://test${path}`,
      getManifest: () => ({ version: '0.1.0' }),
      onInstalled: {
        addListener: (listener: (...args: unknown[]) => void) => {
          listeners.installed.push(listener);
        },
      },
      onMessage: {
        addListener: (listener: (...args: unknown[]) => boolean | undefined) => {
          listeners.message.push(listener);
        },
      },
    },
  },
}));

describe('background entrypoint', () => {
  afterEach(() => {
    getVocabulary.mockReset();
    markHeadwordsKnown.mockReset();
    setStorage.mockClear();
    vi.restoreAllMocks();
  });
  beforeAll(async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubGlobal('defineBackground', (main: () => void) => main());
    await import('@/entrypoints/background');
  });

  it('accepts a valid Known action from YouTube and notifies subtitle tabs after saving', async () => {
    const messageListener = listeners.message[0]!;
    const sender = { url: 'https://www.youtube.com/watch?v=abcdefghijk' };
    const sendResponse = vi.fn();
    const message = { type: 'mark-word-known', headword: '여러분' };
    expect(messageListener({ ...message, headword: ' ' }, sender, sendResponse)).toBe(false);
    expect(messageListener(message, { url: 'https://example.com/' }, sendResponse)).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();

    markHeadwordsKnown.mockResolvedValueOnce(1);
    const response = await new Promise((resolve) => {
      expect(messageListener(message, sender, resolve)).toBe(true);
    });
    expect(markHeadwordsKnown).toHaveBeenCalledExactlyOnceWith(['여러분']);
    expect(setStorage).toHaveBeenCalledExactlyOnceWith({
      vocabularyRevision: { id: expect.any(String), known: ['여러분'], unknown: [] },
    });
    expect(response).toEqual({ ok: true });

    setStorage.mockClear();
    markHeadwordsKnown.mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(new Promise((resolve) => messageListener(message, sender, resolve)))
      .resolves.toEqual({ ok: false, error: 'Storage unavailable' });
    expect(setStorage).not.toHaveBeenCalled();
  });

  it('returns public defaults, rejects invalid settings and handles a failed write', async () => {
    const listener = listeners.message[0]!;
    const youtube = { url: 'https://www.youtube.com/watch?v=abcdefghijk' };
    const options = { url: 'chrome-extension://test/options.html' };
    const request = (message: object, sender = options) =>
      new Promise((resolve) => listener(message, sender, resolve));

    await expect(request({ type: 'get-preferences' }, youtube)).resolves.toEqual({
      ok: true, theme: 'dark', appearance: DEFAULT_SUBTITLE_APPEARANCE,
    });
    const update = { type: 'set-interface-theme', theme: 'light' };
    expect(listener(update, youtube, vi.fn())).toBe(false);
    await expect(request({
      type: 'set-subtitle-appearance',
      appearance: { ...DEFAULT_SUBTITLE_APPEARANCE, size: 500, font: 'constructor' },
    })).resolves.toEqual({ ok: false });
    expect(setStorage).not.toHaveBeenCalled();

    setStorage.mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(request(update)).resolves.toEqual({ ok: false });
    await expect(request(update)).resolves.toMatchObject({ ok: true, theme: 'light' });
    expect(setStorage).toHaveBeenLastCalledWith({ interfaceTheme: 'light' });
  });

  it('serves known headwords from the status index to YouTube tabs', async () => {
    const listener = listeners.message[0]!;
    const youtube = { url: 'https://www.youtube.com/watch?v=abcdefghijk' };
    listKnownHeadwords.mockResolvedValueOnce(['먹다', '학생']);
    await expect(new Promise((resolve) => listener({ type: 'get-known-headwords' }, youtube, resolve)))
      .resolves.toEqual({ ok: true, headwords: ['먹다', '학생'] });
    listKnownHeadwords.mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(new Promise((resolve) => listener({ type: 'get-known-headwords' }, youtube, resolve)))
      .resolves.toEqual({ ok: false });
    expect(listener({ type: 'get-known-headwords' }, { url: 'https://example.com/' }, vi.fn())).toBe(false);
  });

  it('sends only the changed headword to YouTube tabs and keeps the summary private to extension pages', async () => {
    const listener = listeners.message[0]!;
    const options = { url: 'chrome-extension://test/options.html' };
    changeVocabulary.mockResolvedValue(undefined);
    listVocabulary.mockResolvedValue([]);
    const request = (message: object) => new Promise((resolve) => listener(message, options, resolve));

    await expect(request({ type: 'set-vocabulary-status', headword: ' 먹다 ', status: 'unknown' }))
      .resolves.toEqual({ ok: true, entries: [] });
    expect(setStorage).toHaveBeenLastCalledWith({
      vocabularyRevision: { id: expect.any(String), known: [], unknown: ['먹다'] },
    });
    await request({ type: 'set-vocabulary-status', headword: '학생', status: 'known' });
    expect(setStorage).toHaveBeenLastCalledWith({
      vocabularyRevision: { id: expect.any(String), known: ['학생'], unknown: [] },
    });
    await request({ type: 'delete-vocabulary', headword: '학생' });
    expect(setStorage).toHaveBeenLastCalledWith({
      vocabularyRevision: { id: expect.any(String), known: [], unknown: ['학생'] },
    });

    setStorage.mockClear();
    await request({ type: 'edit-vocabulary', headword: '학생', definitions: ['student'] });
    expect(setStorage).not.toHaveBeenCalled();

    const youtube = { url: 'https://www.youtube.com/watch?v=abcdefghijk' };
    expect(listener({ type: 'get-vocabulary-summary' }, youtube, vi.fn())).toBe(false);
    changeVocabulary.mockReset();
    listVocabulary.mockReset();
  });

  it('registers the install and message listeners', () => {
    expect(listeners.installed).toHaveLength(1);
    expect(listeners.message).toHaveLength(1);
  });

  it('responds to a ping with the extension version', () => {
    const messageListener = listeners.message[0]!;
    const sendResponse = vi.fn();
    const result = messageListener({ type: 'ping' }, {}, sendResponse);

    expect(result).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, version: '0.1.0' });
  });

  it('ignores messages it does not understand', () => {
    const messageListener = listeners.message[0]!;
    const sendResponse = vi.fn();
    const result = messageListener({ type: 'unknown' }, {}, sendResponse);

    expect(result).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });
  it('rejects malformed mining requests and blocks vocabulary listing from YouTube', () => {
    const messageListener = listeners.message[0]!;
    const sender = { url: 'https://www.youtube.com/watch?v=abcdefghijk' };
    const sendResponse = vi.fn();

    expect(messageListener({ type: 'mine-word', entry: {} }, sender, sendResponse)).toBe(false);
    expect(messageListener({ type: 'list-vocabulary' }, sender, sendResponse)).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it.each([
    ['known', '학생'],
    ['unknown', '이다'],
    ['unavailable', '이다'],
  ])('looks up %s copula constructions using the saved status', async (status, expectedHeadword) => {
    getVocabulary.mockImplementation(async (headword: string) => {
      if (status === 'unavailable') throw new Error('Storage unavailable');
      return headword === '이다' ? { status, contexts: [] } : undefined;
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(`<channel><item><word>${expectedHeadword}</word><sense><definition>definition</definition></sense></item></channel>`),
    );
    const message = {
      type: 'lookup',
      word: '학생이에요',
      morphemes: [
        { text: '학생', tag: 'NNG' },
        { text: '이', tag: 'VCP' },
        { text: '에요', tag: 'EF' },
      ],
    };
    const response = await new Promise((resolve) => {
      listeners.message[0]!(message, { url: 'https://www.youtube.com/watch?v=abcdefghijk' }, resolve);
    });

    expect(response).toMatchObject({
      ok: true,
      entry: { headword: expectedHeadword, originalForm: '학생이에요' },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.get('q')).toBe(expectedHeadword);
  });

  it('checks contraction aliases when resolving copula lookup order', async () => {
    getVocabulary.mockImplementation(async (headword: string) =>
      headword === '이다' || headword === '무엇' ? { status: 'known', contexts: [] } : undefined,
    );
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response('<channel><item><word>이다</word><sense><definition>to be</definition></sense></item></channel>'),
    );
    const message = {
      type: 'lookup',
      word: '뭔데요',
      morphemes: [
        { text: '뭐', tag: 'NP', position: 0, length: 1 },
        { text: '이', tag: 'VCP', position: 0, length: 1 },
        { text: 'ᆫ데요', tag: 'EF', position: 0, length: 3 },
      ],
    };

    const response = await new Promise((resolve) => {
      listeners.message[0]!(message, { url: 'https://www.youtube.com/watch?v=abcdefghijk' }, resolve);
    });

    expect(getVocabulary).toHaveBeenCalledWith('무엇');
    expect(response).toMatchObject({ ok: true, entry: { headword: '이다', originalForm: '뭔데요' } });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
