import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const { listeners, getVocabulary } = vi.hoisted(() => ({
  getVocabulary: vi.fn(),
  listeners: {
    installed: [] as Array<(...args: unknown[]) => void>,
    message: [] as Array<(...args: unknown[]) => boolean | undefined>,
  },
}));

vi.mock('@/services/storage/vocabulary', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/storage/vocabulary')>(),
  getVocabulary,
}));

vi.mock('@/services/dictionary/cache', () => ({
  getCachedDictionaryEntry: vi.fn(),
  cacheDictionaryEntry: vi.fn(),
  clearDictionaryCache: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    storage: { local: { get: async () => ({ krDictApiKey: 'test-key' }) } },
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
    vi.restoreAllMocks();
  });
  beforeAll(async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubGlobal('defineBackground', (main: () => void) => main());
    await import('@/entrypoints/background');
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
});
