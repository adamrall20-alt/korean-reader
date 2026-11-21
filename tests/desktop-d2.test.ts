import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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
