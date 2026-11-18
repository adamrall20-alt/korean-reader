import { initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore/lite';
import { expect, it } from 'vitest';
import { fetchProgress, syncProgress } from '@/services/account/cloud';
import { accountHistory, wordKey, type WordEdit } from '@/services/account/progress';

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const project = 'demo-korean-reader';
const browserDatabase = (name: string, uid: string) => {
  const [host = '127.0.0.1', port] = emulator!.split(':');
  const db = getFirestore(initializeApp({ projectId: project }, name));
  connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: uid } });
  return db;
};

it.skipIf(!emulator)('imports 13,000 words, merges profiles, rejects stale edits and isolates accounts', async () => {
  const uid = crypto.randomUUID();
  const secondUid = crypto.randomUUID();
  const approve = async (id: string) => {
    const result = await fetch(
      `http://${emulator}/v1/projects/${project}/databases/(default)/documents/phase10Testers?documentId=${id}`,
      { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: '{"fields":{"enabled":{"booleanValue":true}}}' },
    );
    expect(result.ok, await result.text()).toBe(true);
  };
  await Promise.all([approve(uid), approve(secondUid)]);
  const first = browserDatabase('first', uid);
  const second = browserDatabase('second', uid);
  const other = browserDatabase('other', secondUid);
  const unapproved = browserDatabase('unapproved', 'unapproved');
  const timeZone = 'Australia/Melbourne';
  const at = Date.now();
  const firstDevice = { device: crypto.randomUUID(), history: { baseline: { at: at - 86400000, count: 100 }, days: [{ at: at - 1000, count: 13000 }] }, timeZone };
  const toEdit = (known: boolean, revision = 0): WordEdit => ({ known, revision, at });
  const edits = Object.fromEntries(Array.from({ length: 13000 }, (_, index) => [wordKey(`단어${index}`), toEdit(true)]));
  await syncProgress(first, uid, edits, firstDevice);
  const initial = await fetchProgress(second, uid);
  expect(Object.keys(initial.words)).toHaveLength(13000);
  expect(initial.progress?.history).toEqual(firstDevice.history);
  const existing = wordKey('단어0');
  const extra = wordKey('새단어');
  const secondDevice = { device: crypto.randomUUID(), history: null, timeZone };
  const secondEdits = { [existing]: toEdit(true), [extra]: toEdit(true) };
  await syncProgress(second, uid, secondEdits, secondDevice);
  await syncProgress(second, uid, secondEdits, secondDevice);
  await syncProgress(first, uid, { [existing]: toEdit(false, 1) });
  expect(await syncProgress(second, uid, {
    [existing]: toEdit(true, 1), [wordKey('다른단어')]: toEdit(true),
  })).toBe(1);
  const final = await fetchProgress(first, uid);
  expect(final.words[existing]).toEqual({ known: false, revision: 2 });
  expect(Object.values(final.words).filter(({ known }) => known)).toHaveLength(13001);
  expect(accountHistory(final.progress!).days.at(-1)?.count).toBe(13001);
  await expect(fetchProgress(other, uid)).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(syncProgress(other, uid, {}, secondDevice)).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(fetchProgress(unapproved, 'unapproved')).rejects.toMatchObject({ code: 'permission-denied' });
}, 45000);
