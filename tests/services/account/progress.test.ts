import { describe, expect, it } from 'vitest';
import { accountHistory, applyWordEdit, groupId, recordChange, wordKey, type Progress, type WordGroup } from '@/services/account/progress';

describe('account progress', () => {
  it('normalizes headwords and rejects blank, spaced and oversized input', () => {
    expect(wordKey(' 한 '.normalize('NFD'))).toBe(wordKey('한'));
    for (const word of ['', '한 글', '한'.repeat(61)]) expect(() => wordKey(word)).toThrow();
    expect(groupId(wordKey('한'))).toMatch(/^group-\d+$/);
  });

  it('keeps a removal across retries and concurrent stale edits', () => {
    const key = wordKey('한글');
    const group: WordGroup = {};
    expect(applyWordEdit(group, key, { revision: 0, known: true, at: 0 })).toBe(1);
    expect(applyWordEdit(group, key, { revision: 1, known: false, at: 1 })).toBe(-1);
    expect(applyWordEdit(group, key, { revision: 0, known: true, at: 0 })).toBe(0);
    expect(group[key]).toEqual({ revision: 2, known: false });
  });

  it('preserves imported history and revises later totals using the account time zone', () => {
    const importedAt = Date.parse('2026-11-18T00:00:00Z');
    const history = { baseline: { at: importedAt - 86400000, count: 3 }, days: [] };
    const progress: Progress = { history, timeZone: 'Australia/Melbourne', importedAt, importedCount: 3, dailyChanges: {} };
    const now = Date.parse('2026-11-20T00:00:00Z');
    recordChange(progress, now, 1, now);
    recordChange(progress, Date.parse('2026-11-18T15:00:00Z'), 1, now);
    expect(Object.keys(progress.dailyChanges)).toContain('2026-11-19');
    expect(accountHistory(progress).days.map(({ count }) => count)).toEqual([4, 5]);
    recordChange(progress, importedAt - 86400000, -1, now);
    expect(accountHistory(progress).days.map(({ count }) => count)).toEqual([2, 3, 4]);
    expect(accountHistory(progress).baseline).toEqual(history.baseline);
  });
});
