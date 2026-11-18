import type { KnownWordHistory } from '@/types/statistics';

export interface WordState { known: boolean; revision: number }
export type WordGroup = Record<string, WordState>;
export interface WordEdit { known: boolean; revision: number; at: number }
export interface Progress {
  history: KnownWordHistory;
  timeZone: string;
  importedCount: number;
  importedAt: number;
  dailyChanges: Record<string, { at: number; delta: number }>;
}

export const groupCount = 64;

export function wordKey(text: string): string {
  const word = text.trim().normalize('NFC');
  if (!word || /[\s\u0000-\u001f]/u.test(word) || new TextEncoder().encode(word).length > 180) {
    throw new Error('Enter one headword of up to 180 UTF-8 bytes.');
  }
  return `w:${word}`;
}

export function groupId(key: string): string {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
  return `group-${(hash >>> 0) % groupCount}`;
}

export function applyWordEdit(group: WordGroup, key: string, edit: WordEdit): number {
  const current = group[key];
  if ((current?.revision ?? 0) !== edit.revision || (current?.known ?? false) === edit.known) return 0;
  group[key] = { known: edit.known, revision: edit.revision + 1 };
  return edit.known ? 1 : -1;
}

function accountDay(at: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function recordChange(progress: Progress, at: number, delta: number, now: number) {
  if (!delta) return;
  const effectiveAt = Math.max(progress.importedAt, Math.min(at, now));
  const day = accountDay(effectiveAt, progress.timeZone);
  const previous = progress.dailyChanges[day];
  progress.dailyChanges[day] = {
    at: Math.max(previous?.at ?? 0, effectiveAt),
    delta: (previous?.delta ?? 0) + delta,
  };
}

export function accountHistory(progress: Progress): KnownWordHistory {
  const { baseline, days } = progress.history;
  // Preserve the imported points and recalculate account totals in date order.
  let count = progress.importedCount;
  const accountDays = Object.entries(progress.dailyChanges).sort(([a], [b]) => a.localeCompare(b));
  const importedDay = accountDay(progress.importedAt, progress.timeZone);
  const lastImported = days.at(-1) ?? baseline;
  return {
    baseline,
    days: [
      ...days,
      ...(lastImported.count === count || progress.dailyChanges[importedDay] !== undefined
        ? [] : [{ at: progress.importedAt, count }]),
      ...accountDays.map(([, { at, delta }]) => {
        count += delta;
        return { at, count };
      }),
    ],
  };
}
