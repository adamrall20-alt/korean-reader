import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDesktopDatabase } from '../desktop/src/main/db';
import { importVocabularyJson } from '../desktop/src/main/importer';
import { deleteCard, listCards } from '../desktop/src/main/library';
import { LocalMediaStore } from '../desktop/src/main/media';
import { createPracticeSession } from '../desktop/src/main/practice';
import { submitReview, undoLastReview } from '../desktop/src/main/review';
import { getStudyStats, saveKnownWordHistory } from '../desktop/src/main/stats';
import PracticeView from '../desktop/src/renderer/PracticeView.vue';
import ReviewView from '../desktop/src/renderer/ReviewView.vue';
import StatsView from '../desktop/src/renderer/StatsView.vue';
import { createSampleWavDataUrl } from '../desktop/src/shared/fixtures';

const now = new Date(2026, 10, 21, 12);
const source: Array<[string, string, string, string]> = [
  ['먹다', '먹었어요', '저녁을 먹었어요.', 'to eat'],
  ['마시다', '마셨어요', '물을 마셨어요.', 'to drink'],
  ['자다', '잤어요', '어제 일찍 잤어요.', 'to sleep'],
  ['걷다', '걸었어요', '공원을 걸었어요.', 'to walk'],
  ['달리다', '달렸어요', '멀리 달렸어요.', 'to run'],
  ['뛰다', '뛰었어요', '밖에서 뛰었어요.', 'run'],
  ['열다', '열었어요', '열었어요. 또 열었어요.', 'to open'],
  ['찾다', '찾았어요', '친구를 찾았어요.', ''],
];

function library(count = source.length) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-test-d3-'));
  const { db, close } = openDesktopDatabase(':memory:');
  const media = new LocalMediaStore(dir);
  importVocabularyJson(db, media, JSON.stringify(source.slice(0, count).map(([headword, form, sentence, definition]) => ({
    headword, partOfSpeech: 'verb', definitions: definition ? [definition] : [],
    contexts: [{ originalForm: form, sentence, sourceUrl: 'https://example.com', minedAt: now.toISOString(),
      audio: headword === '먹다' ? createSampleWavDataUrl() : undefined }],
  }))), now);
  return { db, media, cleanup: () => { close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

afterEach(() => vi.unstubAllGlobals());

describe('Desktop practice and study statistics', () => {
  it('generates both question types, skips ambiguous occurrences and persists only practice answers', () => {
    const { db, media, cleanup } = library();
    try {
      const practice = createPracticeSession(db, media, () => 0.5, now);
      expect(practice.questions).toHaveLength(6);
      expect(new Set(practice.questions.map(({ type }) => type))).toEqual(new Set(['meaning', 'cloze']));
      const schedules = db.prepare('SELECT * FROM schedules').all();
      for (const question of practice.questions) {
        expect(new Set(question.options).size).toBe(4);
        expect(question.options.includes('to run') && question.options.includes('run')).toBe(false);
        if (question.type === 'cloze') expect(question.target).toBe(null);
        const expected = source.find(([, , sentence]) => sentence.startsWith(question.before) && sentence.endsWith(question.after))!;
        const correct = question.options.indexOf(question.type === 'meaning' ? expected[3]! : expected[1]!);
        expect(correct).toBeGreaterThanOrEqual(0);
        expect(() => practice.answer(question.id, 9)).toThrow('Invalid practice answer');
        const feedback = practice.answer(question.id, correct);
        expect(feedback).toMatchObject({ correct: true, sentence: expected[2] });
        if (expected[0] === '먹다') expect(feedback.audioDataUrl).toBe(createSampleWavDataUrl());
        expect(practice.answer(question.id, 0)).toEqual(feedback);
      }
      expect(db.prepare('SELECT * FROM schedules').all()).toEqual(schedules);
      expect(getStudyStats(db, now)).toMatchObject({ totalReviews: 0, practiceAnswers: 6, practiceAccuracy: 1 });
    } finally { cleanup(); }
  });

  it('produces an empty session with too few distinct answer options', () => {
    const { db, media, cleanup } = library(3);
    try { expect(createPracticeSession(db, media).questions).toEqual([]); }
    finally { cleanup(); }
  });

  it('merges known counts, tracks timing, removes undo from stats and retains totals after a card is deleted', () => {
    const { db, cleanup } = library(2);
    try {
      const yesterday = new Date(2026, 10, 20, 12);
      saveKnownWordHistory(db, { baseline: { at: +yesterday, count: 48 }, days: [{ at: +now, count: 51 }] });
      saveKnownWordHistory(db, { baseline: { at: +yesterday, count: 48 }, days: [{ at: +now - 1000, count: 50 }] });
      expect(() => saveKnownWordHistory(db, { baseline: { at: +now, count: -1 }, days: [] })).toThrow();
      const [first, second] = listCards(db);
      submitReview(db, first!.id, 3, yesterday);
      submitReview(db, second!.id, 1, now, 5_000);
      expect(getStudyStats(db, now)).toMatchObject({ knownWords: 51, totalReviews: 2, timedReviews: 1, reviewTimeMs: 5_000, recallRate: 0.5, streak: 2 });
      undoLastReview(db);
      expect(getStudyStats(db, now)).toMatchObject({ totalReviews: 1, timedReviews: 0, reviewTimeMs: 0, streak: 1 });
      deleteCard(db, first!.id);
      expect(getStudyStats(db, now)).toMatchObject({ knownWords: 51, totalReviews: 1, streak: 1 });
    } finally { cleanup(); }
  });

  it('answers by keyboard, reveals feedback and shows missed words on the results screen', async () => {
    const answerPractice = vi.fn().mockResolvedValue({ correct: false, correctIndex: 1, headword: '먹다', sentence: '저녁을 먹었어요.', meaning: 'to eat' });
    vi.stubGlobal('koreanReaderDesktop', { answerPractice, startPractice: vi.fn().mockResolvedValue([
      { id: 'one', type: 'meaning', before: '저녁을 ', after: '.', target: '먹었어요', focusWord: null, options: ['to drink', 'to eat', 'to run', 'to sleep'] },
    ]) });
    const wrapper = mount(PracticeView);
    try {
      await wrapper.get('button').trigger('click');
      await flushPromises();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      await flushPromises();
      expect(answerPractice).toHaveBeenCalledExactlyOnceWith('one', 0);
      expect(wrapper.text()).toContain('Answer B was correct.');
      await wrapper.findAll('button').find((button) => button.text() === 'See results')!.trigger('click');
      expect(wrapper.text()).toContain('0 / 1 correct');
      expect(wrapper.text()).toContain('먹다');
    } finally { wrapper.unmount(); }
  });

  it('renders the known-word chart and local study totals in Desktop', async () => {
    vi.stubGlobal('koreanReaderDesktop', { getStudyStats: vi.fn().mockResolvedValue({
      knownWords: 52, knownHistory: [{ at: +now - 86_400_000, count: 50 }, { at: +now, count: 52 }],
      totalReviews: 4, timedReviews: 2, reviewTimeMs: 72_000, streak: 2,
      recallRate: 0.75, learnedCards: 2, recentReviews: [], practiceAnswers: 4, practiceAccuracy: 0.5,
    }) });
    const wrapper = mount(StatsView);
    try {
      await flushPromises();
      expect(wrapper.get('svg').attributes('aria-label')).toContain('Latest count 52');
      expect(wrapper.text()).toContain('1 m 12 s');
      expect(wrapper.text()).toContain('2 of 4 reviews timed');
      expect(wrapper.text()).toContain('Practice accuracy');
      await wrapper.findAll('button').find((button) => button.text() === '30 days')!.trigger('click');
      expect(wrapper.findAll('button').find((button) => button.text() === '30 days')?.attributes('aria-pressed')).toBe('true');
    } finally { wrapper.unmount(); }
  });

  it('shows the penguin when the daily review limit is reached', async () => {
    vi.stubGlobal('koreanReaderDesktop', { getNextReviewCard: vi.fn().mockResolvedValue({ card: null, ratingPreviews: [], queue: { dailyLimitReached: true } }) });
    const wrapper = mount(ReviewView);
    try {
      await flushPromises();
      expect(wrapper.text()).toContain('Daily review limit reached');
      expect(decodeURIComponent(wrapper.get('img').attributes('src') ?? '')).toContain('New logo update.png');
    } finally { wrapper.unmount(); }
  });
});
