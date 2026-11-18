import { expect, it, vi } from 'vitest';
import { syncProgress } from '@/services/account/cloud';
import { groupId, wordKey, type Progress } from '@/services/account/progress';

const fake = vi.hoisted(() => ({ documents: new Map<string, unknown>(), transaction: {
  get: vi.fn(), set: vi.fn(),
} }));
vi.mock('firebase/firestore/lite', () => ({
  collection: () => 'data',
  doc: (_parent: unknown, id: string) => ({ id }),
  runTransaction: async (_db: unknown, callback: (tx: unknown) => unknown) => callback(fake.transaction),
}));

it('merges eight new words after the same device imported, preserving history and account removals', async () => {
  const at = Date.now();
  const progress: Progress = {
    history: { baseline: { at, count: 13307 }, days: [] },
    timeZone: 'Australia/Melbourne', importedAt: at, importedCount: 13307, dailyChanges: {},
  };
  fake.documents.set('progress', progress);
  fake.documents.set('device-test', { imported: true });
  const removed = wordKey('지움');
  fake.documents.set(groupId(removed), { words: { [removed]: { known: false, revision: 2 } } });
  fake.transaction.get.mockImplementation(async (ref: { id: string }) => ({
    id: ref.id, ref,
    exists: () => fake.documents.has(ref.id),
    data: () => structuredClone(fake.documents.get(ref.id)),
  }));
  fake.transaction.set.mockImplementation((ref: { id: string }, data: unknown) => {
    fake.documents.set(ref.id, structuredClone(data));
  });
  const edits = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [wordKey(`새단어${i}`), { known: true, revision: 0, at }]));
  edits[removed] = { known: true, revision: 0, at };
  const seed = { device: 'test', history: null, timeZone: 'UTC' };
  await syncProgress(undefined as never, 'test', edits, seed);
  await syncProgress(undefined as never, 'test', edits, seed);
  const updated = fake.documents.get('progress') as Progress;
  expect(updated.history).toEqual(progress.history);
  expect(updated.timeZone).toBe(progress.timeZone);
  expect(Object.values(updated.dailyChanges).reduce((sum, day) => sum + day.delta, 0)).toBe(8);
  expect((fake.documents.get(groupId(removed)) as { words: Record<string, unknown> }).words[removed])
    .toEqual({ known: false, revision: 2 });
});
