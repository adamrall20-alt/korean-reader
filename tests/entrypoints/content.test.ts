import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { VOCABULARY_REVISION_KEY } from '@/types/vocabulary';

const fake = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  storageListeners: [] as Array<(changes: Record<string, { newValue?: unknown }>, area: string) => void>,
  overlayKnown: vi.fn(),
  sidebarKnown: vi.fn(),
  sidebarLanguage: vi.fn(),
  messageListeners: [] as Array<(message: unknown, sender: unknown, respond: (value: unknown) => void) => void>,
}));

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: { sendMessage: fake.sendMessage, onMessage: { addListener: (listener: (typeof fake.messageListeners)[number]) => fake.messageListeners.push(listener), removeListener: vi.fn() } },
    storage: {
      onChanged: {
        addListener: (listener: (typeof fake.storageListeners)[number]) => fake.storageListeners.push(listener),
        removeListener: vi.fn(),
      },
    },
  },
}));
vi.mock('@/services/storage/preferences', () => ({ observePreferences: () => () => {} }));
vi.mock('@/services/youtube/transcript', () => ({ OPEN_TRANSCRIPT: 'open-transcript' }));
vi.mock('@/services/youtube/overlay', () => ({
  createSubtitleOverlay: () => ({ setKnownHeadwords: fake.overlayKnown, prepareCueAudio: vi.fn(), resetLanguage: vi.fn() }),
}));
vi.mock('@/services/youtube/sidebar', () => ({
  createTranscriptSidebar: () => ({ setKnownHeadwords: fake.sidebarKnown, open: vi.fn(), update: vi.fn(), setLanguage: fake.sidebarLanguage }),
}));
vi.mock('@/services/youtube/presenter', () => ({ createSubtitlePresenter: () => ({ update: vi.fn() }) }));
vi.mock('@/services/youtube/captions', () => ({
  createCaptionMonitor: () => ({ start: vi.fn(), stop: vi.fn(), refresh: vi.fn() }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const lastKnown = (mock: ReturnType<typeof vi.fn>) => [...(mock.mock.lastCall![0] as Iterable<string>)].sort();
const change = (newValue: unknown) => fake.storageListeners[0]!({ [VOCABULARY_REVISION_KEY]: { newValue } }, 'local');
const knownRequests = () => fake.sendMessage.mock.calls.filter(([message]) => message.type === 'get-known-headwords');

describe('YouTube content script known words', () => {
  const initial = deferred<unknown>();

  beforeAll(async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubGlobal('defineContentScript', (definition: { main: () => void }) => definition);
    fake.sendMessage.mockImplementationOnce(() => initial.promise);
    const { default: script } = await import('@/entrypoints/content') as unknown as { default: { main: () => void } };
    script.main();
  });

  afterEach(() => {
    fake.overlayKnown.mockClear();
    fake.sidebarKnown.mockClear();
  });

  it('reloads everything before the first load, then patches single-word changes without a full reload', async () => {
    // A change arriving before the first load completes triggers a full load and invalidates the first one.
    fake.sendMessage.mockResolvedValueOnce({ ok: true, headwords: ['먹다', '학생'] });
    change({ id: 'a', known: ['가다'], unknown: [] });
    initial.resolve({ ok: true, headwords: ['먹다'] });
    await flushPromises();
    // Vitest clears mock calls between hooks and tests, so only the replacement request is recorded here.
    expect(knownRequests()).toHaveLength(1);
    expect(fake.overlayKnown).toHaveBeenCalledOnce();
    expect(lastKnown(fake.overlayKnown)).toEqual(['먹다', '학생']);

    fake.sendMessage.mockClear();
    change({ id: 'b', known: ['가다'], unknown: ['학생'] });
    await flushPromises();
    expect(knownRequests()).toHaveLength(0);
    expect(lastKnown(fake.overlayKnown)).toEqual(['가다', '먹다']);
    expect(lastKnown(fake.sidebarKnown)).toEqual(['가다', '먹다']);
  });

  it('falls back to a full reload for bulk changes and legacy revision strings', async () => {
    fake.sendMessage.mockClear();
    fake.sendMessage.mockResolvedValueOnce({ ok: true, headwords: ['하다'] });
    change({ id: 'c' });
    await flushPromises();
    expect(knownRequests()).toHaveLength(1);
    expect(lastKnown(fake.overlayKnown)).toEqual(['하다']);

    fake.sendMessage.mockResolvedValueOnce({ ok: true, headwords: ['하다', '보다'] });
    change('legacy-revision');
    await flushPromises();
    expect(knownRequests()).toHaveLength(2);
    expect(lastKnown(fake.sidebarKnown)).toEqual(['보다', '하다']);
  });

  it('re-fetches when a single-word change arrives during an in-flight full reload', async () => {
    fake.sendMessage.mockClear();
    const stale = deferred<unknown>();
    fake.sendMessage.mockImplementationOnce(() => stale.promise);
    fake.sendMessage.mockResolvedValueOnce({ ok: true, headwords: ['하다', '보다', '오다'] });
    change({ id: 'd' });
    change({ id: 'e', known: ['오다'], unknown: [] });
    stale.resolve({ ok: true, headwords: ['하다', '보다'] });
    await flushPromises();
    expect(knownRequests()).toHaveLength(2);
    expect(lastKnown(fake.overlayKnown)).toEqual(['보다', '오다', '하다']);
  });

  it('keeps the current words when the background is unavailable', async () => {
    fake.sendMessage.mockRejectedValueOnce(new Error('Extension context invalidated.'));
    change({ id: 'f' });
    await flushPromises();
    expect(fake.overlayKnown).not.toHaveBeenCalled();
    change({ id: 'g', known: [], unknown: ['오다'] });
    expect(lastKnown(fake.overlayKnown)).toEqual(['보다', '하다']);
  });

  it('ignores unrelated storage changes', () => {
    fake.sendMessage.mockClear();
    fake.storageListeners[0]!({ other: { newValue: 1 } }, 'local');
    fake.storageListeners[0]!({ [VOCABULARY_REVISION_KEY]: { newValue: 'x' } }, 'sync');
    expect(fake.sendMessage).not.toHaveBeenCalled();
  });

  it('switches known-word caches and ignores Korean revisions in a Japanese tab', async () => {
    fake.sendMessage.mockResolvedValueOnce({ ok: true, headwords: ['1:たべる'] });
    const response = vi.fn();
    fake.messageListeners[0]!({ type: 'reading-language-changed', language: 'ja' }, {}, response);
    await flushPromises();
    expect(response).toHaveBeenCalledWith({ ok: true });
    expect(fake.sidebarLanguage).toHaveBeenCalledWith('ja');
    expect(fake.sendMessage).toHaveBeenCalledWith({ type: 'get-known-headwords', language: 'ja' });
    change({ id: 'ko', known: ['먹다'], unknown: [] });
    expect(lastKnown(fake.overlayKnown)).toEqual(['1:たべる']);
    fake.storageListeners[0]!({ japaneseVocabularyRevision: { newValue: { id: 'ja', known: ['2:ほん'], unknown: [] } } }, 'local');
    expect(lastKnown(fake.overlayKnown)).toEqual(['1:たべる', '2:ほん']);
  });
});
