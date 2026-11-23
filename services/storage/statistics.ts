import { openDatabase, statisticsStore, VOCABULARY_STATUS_INDEX, vocabularyStore } from './database';
import type { ReaderLanguage } from '@/types/language';
import type { KnownWordHistory, KnownWordPoint } from '@/types/statistics';

const BASELINE = 'baseline';

function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `day:${date.getFullYear()}-${month}-${day}`;
}

function countKnown(transaction: IDBTransaction, language: ReaderLanguage) {
  return transaction.objectStore(vocabularyStore(language)).index(VOCABULARY_STATUS_INDEX).count('known');
}

// Call after queuing vocabulary writes so the snapshot and those writes commit together.
export function recordKnownWordCount(transaction: IDBTransaction, language: ReaderLanguage) {
  const store = transaction.objectStore(statisticsStore(language));
  const baseline = store.get(BASELINE);
  baseline.onsuccess = () => {
    const now = new Date();
    const count = countKnown(transaction, language);
    count.onsuccess = () => store.put({ at: now.getTime(), count: count.result }, baseline.result ? localDay(now) : BASELINE);
  };
}

export async function readKnownWordHistory(start: boolean, language: ReaderLanguage = 'ko'): Promise<KnownWordHistory | null> {
  const database = await openDatabase();
  const storeName = statisticsStore(language);
  return new Promise<KnownWordHistory | null>((resolve, reject) => {
    const transaction = start
      ? database.transaction([vocabularyStore(language), storeName], 'readwrite')
      : database.transaction(storeName);
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    let history: KnownWordHistory | null = null;
    request.onsuccess = () => {
      const [baseline, ...days] = request.result as KnownWordPoint[];
      days.sort((a, b) => a.at - b.at);
      if (!start) {
        if (baseline) history = { baseline, days };
        return;
      }
      const count = countKnown(transaction, language);
      count.onsuccess = () => {
        const now = new Date();
        const point = { at: now.getTime(), count: count.result };
        if (!baseline) {
          store.add(point, BASELINE);
          history = { baseline: point, days };
        } else if ((days.at(-1) ?? baseline).count !== point.count) {
          const day = localDay(now);
          store.put(point, day);
          history = { baseline, days: [...days.filter(({ at }) => localDay(new Date(at)) !== day), point] };
        } else {
          history = { baseline, days };
        }
      };
    };
    transaction.oncomplete = () => resolve(history);
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not access known-word history.'));
  });
}
