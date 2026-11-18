import { beforeEach, expect, it, vi } from 'vitest';
import type { Snapshot } from '@/services/account/cloud';
import { wordKey } from '@/services/account/progress';

const fake = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'first', email: 'first@example.test' }, authStateReady: vi.fn() },
  store: new Map<string, unknown>(),
  fetchProgress: vi.fn(),
  syncProgress: vi.fn(),
  write: vi.fn(async (values: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(values)) fake.store.set(key, structuredClone(value));
  }),
}));
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
