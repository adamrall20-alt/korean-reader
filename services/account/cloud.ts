import { collection, doc, getDocs, runTransaction, type Firestore } from 'firebase/firestore/lite';
import type { KnownWordHistory } from '@/types/statistics';
import { applyWordEdit, groupId, recordChange, type Progress, type WordEdit, type WordGroup } from './progress';

export interface Snapshot {
  progress: Progress | null;
  words: WordGroup;
}

export function accountCollection(db: Firestore, uid: string) {
  return collection(db, 'phase10Accounts', uid, 'phase10Data');
}

export async function fetchProgress(db: Firestore, uid: string): Promise<Snapshot> {
  const documents = await getDocs(accountCollection(db, uid));
  const snapshot: Snapshot = { progress: null, words: {} };
  for (const document of documents.docs) {
    const data = document.data();
    if (document.id === 'progress') snapshot.progress = data as Progress;
    else if (document.id.startsWith('group-')) Object.assign(snapshot.words, data.words);
  }
  return snapshot;
}

export async function syncProgress(
  db: Firestore, uid: string, edits: Record<string, WordEdit>,
  seed?: { history: KnownWordHistory | null; timeZone: string; device: string },
) {
  const data = accountCollection(db, uid);
  const profile = doc(data, 'progress');
  const groups = new Map<string, [string, WordEdit][]>();
  for (const [key, edit] of Object.entries(edits)) {
    const id = groupId(key);
    const entries = groups.get(id) ?? [];
    entries.push([key, edit]);
    groups.set(id, entries);
  }

  const now = Date.now();
  return runTransaction(db, async (transaction) => {
    const stored = (await transaction.get(profile)).data() as Progress | undefined;
    const marker = seed && doc(data, `device-${seed.device}`);
    if (marker && (await transaction.get(marker)).exists()) return 0;
    if (!stored && !seed) throw new Error('Import progress before editing the account.');
    const documents = await Promise.all([...groups.keys()].map((id) => transaction.get(doc(data, id))));
    const progress: Progress = stored ?? {
      history: seed!.history ?? { baseline: { at: now, count: Object.keys(edits).length }, days: [] },
      timeZone: seed!.timeZone,
      importedAt: now,
      importedCount: Object.keys(edits).length,
      dailyChanges: {},
    };

    let conflicts = 0;
    let changed = false;
    for (const document of documents) {
      const words: WordGroup = document.data()?.words ?? {};
      let groupChanged = false;
      for (const [key, edit] of groups.get(document.id)!) {
        const delta = applyWordEdit(words, key, edit);
        if (!delta) {
          if (!seed && (words[key]?.revision ?? 0) !== edit.revision) conflicts++;
          continue;
        }
        groupChanged = true;
        if (stored) recordChange(progress, edit.at, delta, now);
      }
      if (groupChanged) {
        if (Object.keys(words).length > 1500) throw new Error('This prototype has reached its word storage limit.');
        transaction.set(document.ref, { words });
        changed = true;
      }
    }
    if (!stored || changed) transaction.set(profile, progress);
    if (marker) transaction.set(marker, { imported: true });
    return conflicts;
  });
}
