import { beforeEach, expect, it, vi } from 'vitest';
import type { Snapshot } from '@/services/account/cloud';
import { wordKey } from '@/services/account/progress';

const fake = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'first', email: 'first@example.test' }, authStateReady: vi.fn() },
  store: new Map<string, unknown>(),
  fetchProgress: vi.fn(),
  syncProgress: vi.fn(),
  listVocabulary: vi.fn(),
  write: vi.fn(async (values: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(values)) fake.store.set(key, structuredClone(value));
  }),
}));
vi.mock('@/services/storage/vocabulary', () => ({ listVocabulary: fake.listVocabulary }));
vi.mock('@/services/storage/statistics', () => ({ readKnownWordHistory: vi.fn().mockResolvedValue(null) }));
vi.mock('firebase/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase/auth/web-extension', () => ({
  initializeAuth: () => fake.auth, indexedDBLocalPersistence: {}, signOut: vi.fn(),
}));
vi.mock('firebase/firestore/lite', () => ({ getFirestore: vi.fn() }));
vi.mock('@/services/account/cloud', () => ({ fetchProgress: fake.fetchProgress, syncProgress: fake.syncProgress }));
vi.mock('wxt/browser', () => ({
  browser: {
    storage: { local: {
      get: async (key: string) => ({ [key]: structuredClone(fake.store.get(key)) }),
      set: fake.write,
    } },
  },
}));

const at = Date.now();
const empty: Snapshot = {
  words: {},
  progress: {
    history: { baseline: { at, count: 0 }, days: [] },
    timeZone: 'Australia/Melbourne', importedAt: at, importedCount: 0, dailyChanges: {},
  },
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  fake.store.clear();
  fake.auth.currentUser = { uid: 'first', email: 'first@example.test' };
  fake.fetchProgress.mockResolvedValue(empty);
  fake.syncProgress.mockResolvedValue(0);
  fake.listVocabulary.mockResolvedValue([]);
});

it('restores pending edits after a worker restart and keeps them scoped to the original user', async () => {
  let { handleAccountMessage } = await import('@/services/account/messages');
  await handleAccountMessage({ type: 'phase10-account', action: 'sync' });
  fake.syncProgress.mockRejectedValue(new Error('Offline'));
  const edited = await handleAccountMessage({ type: 'phase10-account', action: 'edit', word: '한글', known: true });
  expect(edited).toMatchObject({ count: 1, pending: 1, notice: 'Offline' });
  expect(edited.history?.days.at(-1)?.count).toBe(1);

  vi.resetModules();
  ({ handleAccountMessage } = await import('@/services/account/messages'));
  fake.auth.currentUser = { uid: 'second', email: 'second@example.test' };
  const second = await handleAccountMessage({ type: 'phase10-account', action: 'sync' });
  expect(second).toMatchObject({ count: 0, pending: 0 });

  fake.auth.currentUser = { uid: 'first', email: 'first@example.test' };
  expect(await handleAccountMessage({ type: 'phase10-account', action: 'sync' })).toMatchObject({ count: 1, pending: 1 });
  fake.syncProgress.mockResolvedValue(0);
  fake.fetchProgress.mockResolvedValue({ ...empty, words: { [wordKey('한글')]: { known: true, revision: 1 } } });
  expect(await handleAccountMessage({ type: 'phase10-account', action: 'sync' })).toMatchObject({ count: 1, pending: 0 });
});

it('does not send an edit if local persistence fails', async () => {
  const { handleAccountMessage } = await import('@/services/account/messages');
  await handleAccountMessage({ type: 'phase10-account', action: 'sync' });
  fake.write.mockRejectedValueOnce(new Error('Storage unavailable'));
  await expect(handleAccountMessage({ type: 'phase10-account', action: 'edit', word: '한글', known: true }))
    .rejects.toThrow('Storage unavailable');
  expect(fake.syncProgress).not.toHaveBeenCalled();
});

it('merges newly known local words on manual sync and reports the refreshed total', async () => {
  const { handleAccountMessage } = await import('@/services/account/messages');
  await handleAccountMessage({ type: 'phase10-account', action: 'sync' });
  fake.listVocabulary.mockResolvedValue([
    { headword: '한글', status: 'known' }, { headword: '모름', status: 'unknown' },
  ]);
  fake.fetchProgress.mockResolvedValue({ ...empty, words: { [wordKey('한글')]: { known: true, revision: 1 } } });
  const result = await handleAccountMessage({ type: 'phase10-account', action: 'sync' });
  expect(fake.syncProgress).toHaveBeenCalledWith(undefined, 'first', {
    [wordKey('한글')]: { known: true, revision: 0, at: expect.any(Number) },
  }, expect.objectContaining({ device: expect.any(String) }));
  expect(result).toMatchObject({ count: 1, pending: 0, notice: 'Sync complete. 1 account known words.' });
});

it('keeps the previous success time and reports a failed local-word merge', async () => {
  const { handleAccountMessage } = await import('@/services/account/messages');
  const previous = await handleAccountMessage({ type: 'phase10-account', action: 'sync' });
  fake.listVocabulary.mockResolvedValue([{ headword: '한글', status: 'known' }]);
  fake.syncProgress.mockRejectedValue(new Error('Offline'));
  const failed = await handleAccountMessage({ type: 'phase10-account', action: 'import' });
  expect(failed).toMatchObject({ lastSync: previous.lastSync, notice: 'Offline', count: 0 });
});
