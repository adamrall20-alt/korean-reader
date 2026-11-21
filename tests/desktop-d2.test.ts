// @vitest-environment jsdom
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { importAnkiDeck, mapAnkiCardToSchedule } from '../desktop/src/main/anki-import';
import { openDesktopDatabase } from '../desktop/src/main/db';
import { importVocabularyJson } from '../desktop/src/main/importer';
import { LocalMediaStore } from '../desktop/src/main/media';
import {
  formatIntervalText,
  getNextReviewCard,
  getReviewQueueSummary,
  submitReview,
  undoLastReview,
} from '../desktop/src/main/review';
import { getReviewSettings, saveReviewSettings } from '../desktop/src/main/settings';
import ReviewView from '../desktop/src/renderer/ReviewView.vue';
import SettingsView from '../desktop/src/renderer/SettingsView.vue';

const tempDirs: string[] = [];

function createTestEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-desktop-d2-'));
  tempDirs.push(dir);
  const database = openDesktopDatabase(path.join(dir, 'test.sqlite'));
  const mediaStore = new LocalMediaStore(path.join(dir, 'media'));
  return { dir, database, mediaStore };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Phase D2: Anki-compatible FSRS review engine', () => {
  it('formats intervals in Anki style', () => {
    const now = new Date('2026-11-21T10:00:00.000Z');
    expect(formatIntervalText(now, new Date(now.getTime() + 20_000))).toBe('< 1m');
    expect(formatIntervalText(now, new Date(now.getTime() + 10 * 60_000))).toBe('10m');
    expect(formatIntervalText(now, new Date(now.getTime() + 3 * 3_600_000))).toBe('3h');
    expect(formatIntervalText(now, new Date(now.getTime() + 4 * 86_400_000))).toBe('4d');
    expect(formatIntervalText(now, new Date(now.getTime() + 45 * 86_400_000))).toBe('1.5mo');
    expect(formatIntervalText(now, new Date(now.getTime() + 400 * 86_400_000))).toBe('1.1y');
  });

  it('schedules a new card with FSRS, records review_logs, and supports undo', () => {
    const { database, mediaStore } = createTestEnv();
    try {
      const now = new Date('2026-11-21T10:00:00.000Z');
      importVocabularyJson(
        database.db,
        mediaStore,
        JSON.stringify([
          {
            headword: '연습',
            originalForm: '연습했어요',
            definitions: ['practice'],
            koreanDefinitions: [],
            contexts: [
              {
                sentence: '매일 한국어를 연습했어요.',
                originalForm: '연습했어요',
                sourceUrl: 'https://www.youtube.com/watch?v=abc',
                sourceTitle: 'Test Video',
                minedAt: now.toISOString(),
              },
            ],
            status: 'known',
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        ]),
        now,
      );

      const next = getNextReviewCard(database.db, mediaStore, now);
      expect(next.card).not.toBeNull();
      expect(next.card?.headword).toBe('연습');
      expect(next.ratingPreviews).toHaveLength(4);
      expect(next.ratingPreviews.map((p) => p.label)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
      expect(next.queue.newAvailable).toBe(1);
      expect(next.queue.canUndo).toBe(false);

      // Rate Good (3) -> moves to Learning with 10m step in FSRS short-term mode
      const submitted = submitReview(database.db, next.card!.id, 3, now);
      expect(submitted.ok).toBe(true);
      expect(submitted.reviewLogId).toBeTruthy();

      const afterSummary = getReviewQueueSummary(database.db, now);
      expect(afterSummary.newAvailable).toBe(0);
      expect(afterSummary.dueLearning).toBe(1); // within 20m learn-ahead window
      expect(afterSummary.reviewedToday).toBe(1);
      expect(afterSummary.canUndo).toBe(true);

      // Undo restores state back to New (0) and removes review_logs
      const undone = undoLastReview(database.db);
      expect(undone.ok).toBe(true);
      expect(undone.restoredCardId).toBe(next.card!.id);

      const restoredSummary = getReviewQueueSummary(database.db, now);
      expect(restoredSummary.newAvailable).toBe(1);
      expect(restoredSummary.dueLearning).toBe(0);
      expect(restoredSummary.reviewedToday).toBe(0);
      expect(restoredSummary.canUndo).toBe(false);
    } finally {
      database.close();
    }
  });

  it('rejects invalid rating or missing card ID cleanly', () => {
    const { database } = createTestEnv();
    try {
      expect(submitReview(database.db, 'missing-id', 3).ok).toBe(false);
      expect(undoLastReview(database.db).ok).toBe(false);
    } finally {
      database.close();
    }
  });
});

describe('Phase D2: Retain Anki scheduling on import', () => {
  it('maps Anki Review, Learning, and New cards to FSRS schedules accurately', () => {
    const now = new Date('2026-11-21T10:00:00.000Z');
    const twoDaysAgoSec = Math.floor((now.getTime() - 2 * 86_400_000) / 1000);

    const reviewSchedule = mapAnkiCardToSchedule(
      {
        cardId: 101,
        type: 2,
        interval: 15,
        factor: 2500,
        reps: 7,
        lapses: 1,
        mod: twoDaysAgoSec,
      },
      now,
    );
    expect(reviewSchedule.state).toBe(2);
    expect(reviewSchedule.scheduledDays).toBe(15);
    expect(reviewSchedule.stability).toBe(15);
    expect(reviewSchedule.difficulty).toBe(5);
    expect(reviewSchedule.reps).toBe(7);
    expect(reviewSchedule.lapses).toBe(1);
    expect(reviewSchedule.elapsedDays).toBe(2);
    // Due 13 days from now (2 days ago + 15 days)
    expect(Date.parse(reviewSchedule.dueAt)).toBeGreaterThan(now.getTime() + 12 * 86_400_000);

    const newSchedule = mapAnkiCardToSchedule({ cardId: 102, type: 0, reps: 0 }, now);
    expect(newSchedule.state).toBe(0);
    expect(newSchedule.reps).toBe(0);
    expect(newSchedule.lastReviewAt).toBeNull();
  });

  it('imports Anki deck notes with their card scheduling via cardsInfo', async () => {
    const { database, mediaStore } = createTestEnv();
    const now = new Date();
    const yesterdaySec = Math.floor((now.getTime() - 86_400_000) / 1000);
    const twentyDaysAgoSec = Math.floor((now.getTime() - 20 * 86_400_000) / 1000);

    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const payload = JSON.parse(body) as { action: string };
        res.setHeader('Content-Type', 'application/json');

        if (payload.action === 'findNotes') {
          res.end(JSON.stringify({ result: [1, 2], error: null }));
          return;
        }
        if (payload.action === 'notesInfo') {
          res.end(
            JSON.stringify({
              result: [
                {
                  noteId: 1,
                  cards: [1001],
                  fields: {
                    'Focus Word': { value: '미래' },
                    Sentence: { value: '미래를 준비해요.' },
                    Definition: { value: 'future' },
                  },
                },
                {
                  noteId: 2,
                  cards: [1002],
                  fields: {
                    'Focus Word': { value: '과거' },
                    Sentence: { value: '과거를 기억해요.' },
                    Definition: { value: 'past' },
                  },
                },
              ],
              error: null,
            }),
          );
          return;
        }
        if (payload.action === 'cardsInfo') {
          res.end(
            JSON.stringify({
              result: [
                // Future-due review card (reviewed yesterday, 30d interval -> NOT due)
                {
                  cardId: 1001,
                  note: 1,
                  type: 2,
                  interval: 30,
                  factor: 2500,
                  reps: 8,
                  lapses: 0,
                  mod: yesterdaySec,
                },
                // Overdue review card (reviewed 20 days ago, 10d interval -> DUE)
                {
                  cardId: 1002,
                  note: 2,
                  type: 2,
                  interval: 10,
                  factor: 2100,
                  reps: 5,
                  lapses: 2,
                  mod: twentyDaysAgoSec,
                },
              ],
              error: null,
            }),
          );
          return;
        }
        res.end(JSON.stringify({ result: null, error: `Unknown action: ${payload.action}` }));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const summary = await importAnkiDeck({
        db: database.db,
        mediaStore,
        deckName: 'Korean',
        endpoint: `http://127.0.0.1:${port}`,
      });

      expect(summary.cardsAdded).toBe(2);

      // Only '과거' (overdue) should be due right now; '미래' (due in 29 days) should not be due
      const queue = getReviewQueueSummary(database.db, now);
      expect(queue.newAvailable).toBe(0);
      expect(queue.dueReviews).toBe(1);

      const next = getNextReviewCard(database.db, mediaStore, now);
      expect(next.card?.headword).toBe('과거');
      expect(next.card?.reps).toBe(5);
      expect(next.card?.lapses).toBe(2);
    } finally {
      server.close();
      database.close();
    }
  });
});

describe('Phase D2: Review settings and media rendering', () => {
  it('persists and clamps dailyNewLimit and dailyReviewLimit', () => {
    const { database } = createTestEnv();
    try {
      expect(getReviewSettings(database.db)).toEqual({
        dailyNewLimit: 20,
        dailyReviewLimit: 200,
      });

      const saved = saveReviewSettings(database.db, {
        dailyNewLimit: -5,
        dailyReviewLimit: 15000,
      });
      expect(saved).toEqual({
        dailyNewLimit: 0,
        dailyReviewLimit: 9999,
      });

      const updated = saveReviewSettings(database.db, {
        dailyNewLimit: 15,
        dailyReviewLimit: 50,
      });
      expect(updated).toEqual({
        dailyNewLimit: 15,
        dailyReviewLimit: 50,
      });
      expect(getReviewSettings(database.db)).toEqual({
        dailyNewLimit: 15,
        dailyReviewLimit: 50,
      });
    } finally {
      database.close();
    }
  });

  it('enforces dailyReviewLimit and dailyNewLimit in the review queue', () => {
    const { database, mediaStore } = createTestEnv();
    try {
      const now = new Date('2026-11-21T10:00:00.000Z');
      importVocabularyJson(
        database.db,
        mediaStore,
        JSON.stringify([
          {
            headword: '사과',
            definitions: ['apple'],
            contexts: [
              {
                sentence: '사과를 먹어요.',
                originalForm: '사과를',
                sourceUrl: 'https://www.youtube.com/watch?v=1',
                sourceTitle: 'V1',
                minedAt: now.toISOString(),
              },
            ],
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
          {
            headword: '바나나',
            definitions: ['banana'],
            contexts: [
              {
                sentence: '바나나를 먹어요.',
                originalForm: '바나나를',
                sourceUrl: 'https://www.youtube.com/watch?v=2',
                sourceTitle: 'V2',
                minedAt: now.toISOString(),
              },
            ],
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        ]),
        now,
      );

      saveReviewSettings(database.db, { dailyNewLimit: 2, dailyReviewLimit: 1 });

      const first = getNextReviewCard(database.db, mediaStore, now);
      expect(first.card).not.toBeNull();
      expect(first.queue.totalDue).toBe(1);
      expect(first.queue.dailyLimitReached).toBe(false);

      const submitted = submitReview(database.db, first.card!.id, 4, now);
      expect(submitted.ok).toBe(true);

      const second = getNextReviewCard(database.db, mediaStore, now);
      expect(second.card).toBeNull();
      expect(second.queue.dailyLimitReached).toBe(true);
      expect(second.queue.totalDue).toBe(0);
      expect(second.queue.reviewedToday).toBe(1);
    } finally {
      database.close();
    }
  });

  it('renders card image and audio (including secondary context fallback) in ReviewView', async () => {
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

    (window as unknown as { koreanReaderDesktop?: unknown }).koreanReaderDesktop = {
      getNextReviewCard: vi.fn().mockResolvedValue({
        card: {
          id: 'card-1',
          headword: '연습',
          definitions: ['practice'],
          koreanDefinitions: [],
          preferredContextId: 'ctx-1',
          scheduleState: 0,
          dueAt: new Date().toISOString(),
          reps: 0,
          lapses: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          contexts: [
            {
              id: 'ctx-1',
              sentence: '매일 연습해요.',
              originalForm: '연습해요',
              sourceUrl: 'https://www.youtube.com/watch?v=abc',
              sourceTitle: 'Video 1',
              hasImage: false,
              hasAudio: false,
              minedAt: new Date().toISOString(),
            },
            {
              id: 'ctx-2',
              sentence: '집에서 연습해요.',
              originalForm: '연습해요',
              sourceUrl: 'https://www.youtube.com/watch?v=def',
              sourceTitle: 'Video 2',
              hasImage: true,
              hasAudio: true,
              minedAt: new Date().toISOString(),
              imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
              audioDataUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZF',
            },
          ],
        },
        ratingPreviews: [],
        queue: {
          newAvailable: 1,
          dueLearning: 0,
          dueReviews: 0,
          totalDue: 1,
          reviewedToday: 0,
          dailyNewLimit: 20,
          dailyReviewLimit: 200,
          dailyLimitReached: false,
          canUndo: false,
        },
      }),
      openExternalUrl: vi.fn(),
    };

    const wrapper = mount(ReviewView);
    await flushPromises();

    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('data:image/png;base64,iVBORw0KGgo=');

    const audio = wrapper.find('audio');
    expect(audio.exists()).toBe(true);
    expect(audio.attributes('src')).toBe('data:audio/wav;base64,UklGRiQAAABXQVZF');
    expect(loadSpy).toHaveBeenCalled();
    expect(playSpy).toHaveBeenCalled();

    loadSpy.mockRestore();
    playSpy.mockRestore();
  });

  it('loads and saves daily limits in SettingsView', async () => {
    const saveMock = vi.fn().mockResolvedValue({ dailyNewLimit: 15, dailyReviewLimit: 120 });
    (window as unknown as { koreanReaderDesktop?: unknown }).koreanReaderDesktop = {
      getReviewSettings: vi.fn().mockResolvedValue({ dailyNewLimit: 25, dailyReviewLimit: 180 }),
      saveReviewSettings: saveMock,
    };

    const wrapper = mount(SettingsView);
    await flushPromises();

    const newInput = wrapper.find('#daily-new-limit');
    const reviewInput = wrapper.find('#daily-review-limit');
    expect((newInput.element as HTMLInputElement).value).toBe('25');
    expect((reviewInput.element as HTMLInputElement).value).toBe('180');

    await newInput.setValue('15');
    await reviewInput.setValue('120');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(saveMock).toHaveBeenCalledWith({ dailyNewLimit: 15, dailyReviewLimit: 120 });
    expect(wrapper.text()).toContain('Settings saved.');
  });
});
