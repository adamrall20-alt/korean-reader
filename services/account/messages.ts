import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider, indexedDBLocalPersistence, initializeAuth, signInWithCredential, signOut,
} from 'firebase/auth/web-extension';
import { getFirestore } from 'firebase/firestore/lite';
import { browser } from 'wxt/browser';
import { type AccountMessage, type AccountView } from '@/types/account';
import { listVocabulary } from '@/services/storage/vocabulary';
import { readKnownWordHistory } from '@/services/storage/statistics';
import { fetchProgress, syncProgress, type Snapshot } from './cloud';
import { accountHistory, recordChange, wordKey, type WordEdit } from './progress';

interface LocalProgress extends Snapshot {
  pending: Record<string, WordEdit>;
  lastSync: number | null;
}

function connect() {
  const app = initializeApp({
    apiKey: import.meta.env.WXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: import.meta.env.WXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.WXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: import.meta.env.WXT_PUBLIC_FIREBASE_APP_ID,
  });
  const auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
  return { auth, db: getFirestore(app) };
}

let connection: ReturnType<typeof connect> | undefined;
let lastRequest: Promise<unknown> = Promise.resolve();

async function handle(message: AccountMessage): Promise<AccountView> {
  const { auth, db } = connection ??= connect();
  await auth.authStateReady();
  if (message.action === 'sign-in' && !auth.currentUser) {
    const { token } = await browser.identity.getAuthToken({ interactive: true });
    if (!token) throw new Error('Chrome did not return a Google sign-in token.');
    try {
      await signInWithCredential(auth, GoogleAuthProvider.credential(null, token));
    } finally {
      await browser.identity.removeCachedAuthToken({ token }).catch(() => undefined);
    }
  }
  if (message.action === 'sign-out') await signOut(auth);

  const user = auth.currentUser;
  if (!user) return {
    email: null, imported: false, count: 0, pending: 0, lastSync: null, history: null, timeZone: null,
  };

  const key = `phase10:${user.uid}`;
  const local: LocalProgress = (await browser.storage.local.get(key))[key] as LocalProgress | undefined
    ?? { progress: null, words: {}, pending: {}, lastSync: null };
  const save = () => browser.storage.local.set({ [key]: local });
  let notice: string | undefined;

  if (message.action === 'edit') {
    if (!local.progress) throw new Error('Import or sync your account progress first.');
    const word = wordKey(message.word!);
    const current = local.words[word];
    if ((current?.known ?? false) === message.known) delete local.pending[word];
    else local.pending[word] = { known: message.known!, revision: current?.revision ?? 0, at: Date.now() };
    await save();
  }

  if (message.action === 'import' || message.action === 'sync' || message.action === 'sign-in' || message.action === 'edit') {
    try {
      const pendingCount = Object.keys(local.pending).length;
      if (pendingCount) {
        const conflicts = await syncProgress(db, user.uid, local.pending);
        if (conflicts) notice = `Kept the account’s newer change for ${conflicts} word(s).`;
      }
      if (message.action === 'import') {
        const [entries, history, installation] = await Promise.all([
          listVocabulary(), readKnownWordHistory(false), browser.storage.local.get('phase10Device'),
        ]);
        const device = installation.phase10Device as string | undefined ?? crypto.randomUUID();
        if (!installation.phase10Device) await browser.storage.local.set({ phase10Device: device });
        const now = Date.now();
        const words: Record<string, WordEdit> = {};
        for (const entry of entries) {
          if (entry.status === 'known') words[wordKey(entry.headword)] = { known: true, revision: 0, at: now };
        }
        await syncProgress(db, user.uid, words, { device, history, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      }
      const synced = { ...await fetchProgress(db, user.uid), lastSync: Date.now(), pending: {} };
      await browser.storage.local.set({ [key]: synced });
      Object.assign(local, synced);
    } catch (error) {
      notice = error instanceof Error ? error.message : 'Cloud sync is unavailable.';
    }
  }

  const displayed = { ...local.words, ...local.pending };
  const progress = local.progress && structuredClone(local.progress);
  if (progress) {
    const now = Date.now();
    for (const [word, edit] of Object.entries(local.pending)) {
      recordChange(progress, edit.at, Number(edit.known) - Number(local.words[word]?.known ?? false), now);
    }
  }
  return {
    email: user.email ?? 'Google account',
    imported: Boolean(local.progress),
    count: Object.values(displayed).filter((word) => word.known).length,
    pending: Object.keys(local.pending).length,
    lastSync: local.lastSync,
    history: progress && accountHistory(progress),
    timeZone: local.progress?.timeZone ?? null,
    notice,
  };
}

export function handleAccountMessage(message: AccountMessage) {
  const request = lastRequest.then(() => handle(message));
  lastRequest = request.catch(() => undefined);
  return request;
}
