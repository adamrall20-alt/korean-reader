import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { openDesktopDatabase } from '../desktop/src/main/db';
import { mergeKnownWords } from '../desktop/src/main/known-words';
import { getProfileUsername, saveProfileUsername } from '../desktop/src/main/profile';
import { getStudyStats, saveKnownWordHistory } from '../desktop/src/main/stats';
import ProfileView from '../desktop/src/renderer/ProfileView.vue';
import { reviewProgress, vocabularyProgress } from '../desktop/src/shared/profile';

afterEach(() => vi.unstubAllGlobals());

it('uses 25 XP for the first level and increases the cost by five at each level', () => {
  expect(reviewProgress(0)).toEqual({ level: 1, earned: 0, required: 25 });
  expect(reviewProgress(24)).toEqual({ level: 1, earned: 24, required: 25 });
  expect(reviewProgress(25)).toEqual({ level: 2, earned: 0, required: 30 });
  expect(reviewProgress(54)).toEqual({ level: 2, earned: 29, required: 30 });
  expect(reviewProgress(55)).toEqual({ level: 3, earned: 0, required: 35 });
});

it('ranks the exact Desktop Known list and falls back to imported history until words are linked', () => {
  const database = openDesktopDatabase(':memory:');
  try {
    expect(vocabularyProgress(getStudyStats(database.db).knownWords)).toBeNull();
    saveKnownWordHistory(database.db, { baseline: { at: Date.now(), count: 1000 }, days: [] });
    expect(vocabularyProgress(getStudyStats(database.db).knownWords)?.rank.name).toBe('이야기 탐험가');
    mergeKnownWords(database.db, [
      { headword: '책', known: true, revision: 1 },
      { headword: '펭귄', known: false, revision: 1 },
    ]);
    expect(getStudyStats(database.db).knownWords).toBe(1);
    mergeKnownWords(database.db, [{ headword: '책', known: false, revision: 2 }]);
    expect(getStudyStats(database.db).knownWords).toBe(0);
    expect(vocabularyProgress(30_000)).toMatchObject({ rank: { name: '어휘 달인' }, next: undefined });
  } finally {
    database.close();
  }
});

it('persists a trimmed username and rejects invalid replacements', () => {
  const database = openDesktopDatabase(':memory:');
  try {
    expect(getProfileUsername(database.db)).toBe('Reader');
    expect(saveProfileUsername(database.db, '  Adam  ')).toBe('Adam');
    expect(() => saveProfileUsername(database.db, '  ')).toThrow('Enter a username');
    expect(() => saveProfileUsername(database.db, 'a'.repeat(33))).toThrow('Enter a username');
    expect(() => saveProfileUsername(database.db, 'Adam\nReader')).toThrow('Enter a username');
    expect(getProfileUsername(database.db)).toBe('Adam');
  } finally {
    database.close();
  }
});

it('shows earned progress and the saved username in the Profile view', async () => {
  const save = vi.fn().mockResolvedValue('Adam');
  let refresh: (() => void) | undefined;
  const stats = vi.fn().mockResolvedValue({ knownWords: 250, totalReviews: 28 });
  vi.stubGlobal('koreanReaderDesktop', {
    getProfileUsername: async () => 'Reader',
    saveProfileUsername: save,
    getStudyStats: stats,
    onKnownHistoryUpdated(callback: () => void) { refresh = callback; return () => { refresh = undefined; }; },
  });
  const view = mount(ProfileView);
  await flushPromises();
  expect(view.text()).toContain('Level 2');
  expect(view.text()).toContain('3 / 30 XP');
  expect(view.text()).toContain('새내기 독자');

  await view.get('#profile-username').setValue('Adam');
  await view.get('form').trigger('submit');
  await flushPromises();
  expect(save).toHaveBeenCalledWith('Adam');
  expect(view.text()).toContain('Adam');
  expect(view.text()).toContain('Saved');

  stats.mockResolvedValue({ knownWords: 1_002, totalReviews: 55 });
  refresh?.();
  await flushPromises();
  expect(view.text()).toContain('Level 3');
  expect(view.text()).toContain('이야기 탐험가');
  view.unmount();
});
