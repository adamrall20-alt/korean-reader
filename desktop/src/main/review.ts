import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type Grade,
} from 'ts-fsrs';
import type {
  NextReviewCardResult,
  ReviewQueueSummary,
  ReviewRatingPreview,
  ReviewRatingValue,
  SubmitReviewResult,
  UndoReviewResult,
} from '../shared/api';
import { getCardDetail } from './library';
import type { LocalMediaStore } from './media';

export const DEFAULT_DAILY_NEW_LIMIT = 20;
const LEARN_AHEAD_MS = 20 * 60 * 1000;

interface ScheduleRow {
  card_id: string;
  state: number;
  due_at: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  learning_steps: number;
  last_review_at: string | null;
}

const RATING_META: Array<{
  rating: ReviewRatingValue;
  grade: Grade;
  label: ReviewRatingPreview['label'];
}> = [
  { rating: 1, grade: Rating.Again, label: 'Again' },
  { rating: 2, grade: Rating.Hard, label: 'Hard' },
  { rating: 3, grade: Rating.Good, label: 'Good' },
  { rating: 4, grade: Rating.Easy, label: 'Easy' },
];

export function createAnkiFsrsScheduler() {
  return fsrs(
    generatorParameters({
      enable_short_term: true,
      request_retention: 0.9,
      maximum_interval: 36500,
    }),
  );
}

function startOfLocalDayIso(now: Date): string {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return start.toISOString();
}

export function formatIntervalText(now: Date, due: Date): string {
  const diffMs = Math.max(0, due.getTime() - now.getTime());
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return '< 1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(diffMs / 86_400_000);
  if (days < 30) return `${days}d`;
  if (days < 365) {
    const months = Math.round((days / 30) * 10) / 10;
    return `${months}mo`;
  }
  const years = Math.round((days / 365) * 10) / 10;
  return `${years}y`;
}

function scheduleRowToFsrsCard(row: ScheduleRow, now: Date): Card {
  if (row.state === State.New && row.reps === 0 && row.stability === 0) {
    return createEmptyCard(now);
  }
  const due = new Date(row.due_at);
  const lastReview = row.last_review_at ? new Date(row.last_review_at) : undefined;
  return {
    due: Number.isNaN(due.getTime()) ? now : due,
    stability: Number(row.stability ?? 0),
    difficulty: Number(row.difficulty ?? 0),
    scheduled_days: Number(row.scheduled_days ?? 0),
    reps: Number(row.reps ?? 0),
    lapses: Number(row.lapses ?? 0),
    learning_steps: Number(row.learning_steps ?? 0),
    state: Number(row.state ?? 0) as State,
    last_review: lastReview && !Number.isNaN(lastReview.getTime()) ? lastReview : undefined,
  };
}

function getScheduleRow(db: DatabaseSync, cardId: string): ScheduleRow | null {
  const row = db
    .prepare(
      `SELECT card_id, state, due_at, stability, difficulty,
              elapsed_days, scheduled_days, reps, lapses, learning_steps, last_review_at
       FROM schedules
       WHERE card_id = ?`,
    )
    .get(cardId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    card_id: String(row.card_id),
    state: Number(row.state ?? 0),
    due_at: String(row.due_at ?? new Date().toISOString()),
    stability: Number(row.stability ?? 0),
    difficulty: Number(row.difficulty ?? 0),
    elapsed_days: Number(row.elapsed_days ?? 0),
    scheduled_days: Number(row.scheduled_days ?? 0),
    reps: Number(row.reps ?? 0),
    lapses: Number(row.lapses ?? 0),
    learning_steps: Number(row.learning_steps ?? 0),
    last_review_at: typeof row.last_review_at === 'string' ? row.last_review_at : null,
  };
}

export function getReviewQueueSummary(
  db: DatabaseSync,
  now = new Date(),
  dailyNewLimit = DEFAULT_DAILY_NEW_LIMIT,
): ReviewQueueSummary {
  const nowIso = now.toISOString();
  const learnAheadIso = new Date(now.getTime() + LEARN_AHEAD_MS).toISOString();
  const dayStartIso = startOfLocalDayIso(now);

  const dueLearning = Number(
    (
      db
        .prepare(
          'SELECT COUNT(*) AS count FROM schedules WHERE state IN (1, 3) AND due_at <= ?',
        )
        .get(learnAheadIso) as { count?: number } | undefined
    )?.count ?? 0,
  );

  const dueReviews = Number(
    (
      db
        .prepare('SELECT COUNT(*) AS count FROM schedules WHERE state = 2 AND due_at <= ?')
        .get(nowIso) as { count?: number } | undefined
    )?.count ?? 0,
  );

  const totalNew = Number(
    (
      db
        .prepare('SELECT COUNT(*) AS count FROM schedules WHERE state = 0')
        .get() as { count?: number } | undefined
    )?.count ?? 0,
  );

  const newIntroducedToday = Number(
    (
      db
        .prepare(
          `SELECT COUNT(DISTINCT card_id) AS count
           FROM review_logs
           WHERE reviewed_at >= ?
             AND json_extract(prev_schedule_json, '$.state') = 0`,
        )
        .get(dayStartIso) as { count?: number } | undefined
    )?.count ?? 0,
  );

  const remainingNewQuota = Math.max(0, dailyNewLimit - newIntroducedToday);
  const newAvailable = Math.min(totalNew, remainingNewQuota);

  const reviewedToday = Number(
    (
      db
        .prepare('SELECT COUNT(*) AS count FROM review_logs WHERE reviewed_at >= ?')
        .get(dayStartIso) as { count?: number } | undefined
    )?.count ?? 0,
  );

  const canUndo =
    Number(
      (
        db
          .prepare('SELECT COUNT(*) AS count FROM review_logs')
          .get() as { count?: number } | undefined
      )?.count ?? 0,
    ) > 0;

  return {
    newAvailable,
    dueLearning,
    dueReviews,
    totalDue: dueLearning + dueReviews + newAvailable,
    reviewedToday,
    canUndo,
  };
}

export function getNextReviewCard(
  db: DatabaseSync,
  mediaStore: LocalMediaStore,
  now = new Date(),
  dailyNewLimit = DEFAULT_DAILY_NEW_LIMIT,
): NextReviewCardResult {
  const queue = getReviewQueueSummary(db, now, dailyNewLimit);
  const nowIso = now.toISOString();
  const learnAheadIso = new Date(now.getTime() + LEARN_AHEAD_MS).toISOString();

  // 1. Learning/relearning cards due right now
  let candidate = db
    .prepare(
      `SELECT card_id FROM schedules
       WHERE state IN (1, 3) AND due_at <= ?
       ORDER BY due_at ASC
       LIMIT 1`,
    )
    .get(nowIso) as { card_id?: string } | undefined;

  // 2. Due review cards
  if (!candidate?.card_id) {
    candidate = db
      .prepare(
        `SELECT card_id FROM schedules
         WHERE state = 2 AND due_at <= ?
         ORDER BY due_at ASC
         LIMIT 1`,
      )
      .get(nowIso) as { card_id?: string } | undefined;
  }

  // 3. New cards (within daily new limit)
  if (!candidate?.card_id && queue.newAvailable > 0) {
    candidate = db
      .prepare(
        `SELECT s.card_id
         FROM schedules s
         JOIN cards c ON c.id = s.card_id
         WHERE s.state = 0
         ORDER BY c.created_at ASC, c.headword ASC
         LIMIT 1`,
      )
      .get() as { card_id?: string } | undefined;
  }

  // 4. Learn-ahead learning/relearning cards due within 20 minutes
  if (!candidate?.card_id) {
    candidate = db
      .prepare(
        `SELECT card_id FROM schedules
         WHERE state IN (1, 3) AND due_at <= ?
         ORDER BY due_at ASC
         LIMIT 1`,
      )
      .get(learnAheadIso) as { card_id?: string } | undefined;
  }

  if (!candidate?.card_id) {
    return {
      card: null,
      ratingPreviews: [],
      queue,
    };
  }

  const cardDetail = getCardDetail(db, mediaStore, candidate.card_id);
  const scheduleRow = getScheduleRow(db, candidate.card_id);

  if (!cardDetail || !scheduleRow) {
    return {
      card: null,
      ratingPreviews: [],
      queue,
    };
  }

  const scheduler = createAnkiFsrsScheduler();
  const fsrsCard = scheduleRowToFsrsCard(scheduleRow, now);
  const outcomes = scheduler.repeat(fsrsCard, now);

  const ratingPreviews: ReviewRatingPreview[] = RATING_META.map(({ rating, grade, label }) => {
    const nextCard = outcomes[grade].card;
    return {
      rating,
      label,
      intervalText: formatIntervalText(now, nextCard.due),
      dueAt: nextCard.due.toISOString(),
      scheduledDays: nextCard.scheduled_days,
      state: nextCard.state,
    };
  });

  return {
    card: cardDetail,
    ratingPreviews,
    queue,
  };
}

export function submitReview(
  db: DatabaseSync,
  cardId: string,
  rating: ReviewRatingValue,
  now = new Date(),
): SubmitReviewResult {
  const meta = RATING_META.find((item) => item.rating === rating);
  if (!meta) {
    return { ok: false, error: 'Invalid rating value.' };
  }

  const scheduleRow = getScheduleRow(db, cardId);
  if (!scheduleRow) {
    return { ok: false, error: 'Card schedule not found.' };
  }

  const scheduler = createAnkiFsrsScheduler();
  const fsrsCard = scheduleRowToFsrsCard(scheduleRow, now);
  const result = scheduler.repeat(fsrsCard, now)[meta.grade];
  const nextCard = result.card;

  const reviewLogId = crypto.randomUUID();
  const nowIso = now.toISOString();
  const nextDueIso = nextCard.due.toISOString();
  const elapsedDays = scheduleRow.last_review_at
    ? Math.max(
        0,
        Math.round((now.getTime() - Date.parse(scheduleRow.last_review_at)) / 86_400_000),
      )
    : 0;

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO review_logs (
         id, card_id, rating, state, due_at, reviewed_at, prev_schedule_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      reviewLogId,
      cardId,
      rating,
      nextCard.state,
      nextDueIso,
      nowIso,
      JSON.stringify(scheduleRow),
    );

    db.prepare(
      `UPDATE schedules
       SET state = ?,
           due_at = ?,
           stability = ?,
           difficulty = ?,
           elapsed_days = ?,
           scheduled_days = ?,
           reps = ?,
           lapses = ?,
           learning_steps = ?,
           last_review_at = ?
       WHERE card_id = ?`,
    ).run(
      nextCard.state,
      nextDueIso,
      nextCard.stability,
      nextCard.difficulty,
      elapsedDays,
      nextCard.scheduled_days,
      nextCard.reps,
      nextCard.lapses,
      nextCard.learning_steps ?? 0,
      nowIso,
      cardId,
    );

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to save review.',
    };
  }

  return {
    ok: true,
    reviewLogId,
    nextDueAt: nextDueIso,
  };
}

export function undoLastReview(db: DatabaseSync): UndoReviewResult {
  const latest = db
    .prepare(
      `SELECT id, card_id, prev_schedule_json
       FROM review_logs
       ORDER BY reviewed_at DESC, rowid DESC
       LIMIT 1`,
    )
    .get() as { id?: string; card_id?: string; prev_schedule_json?: string } | undefined;

  if (!latest?.id || !latest.card_id || !latest.prev_schedule_json) {
    return { ok: false, error: 'No review to undo.' };
  }

  let prev: ScheduleRow;
  try {
    prev = JSON.parse(latest.prev_schedule_json) as ScheduleRow;
  } catch {
    return { ok: false, error: 'Stored undo snapshot is corrupted.' };
  }

  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE schedules
       SET state = ?,
           due_at = ?,
           stability = ?,
           difficulty = ?,
           elapsed_days = ?,
           scheduled_days = ?,
           reps = ?,
           lapses = ?,
           learning_steps = ?,
           last_review_at = ?
       WHERE card_id = ?`,
    ).run(
      Number(prev.state ?? 0),
      String(prev.due_at),
      Number(prev.stability ?? 0),
      Number(prev.difficulty ?? 0),
      Number(prev.elapsed_days ?? 0),
      Number(prev.scheduled_days ?? 0),
      Number(prev.reps ?? 0),
      Number(prev.lapses ?? 0),
      Number(prev.learning_steps ?? 0),
      prev.last_review_at ?? null,
      latest.card_id,
    );

    db.prepare('DELETE FROM review_logs WHERE id = ?').run(latest.id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to undo review.',
    };
  }

  return {
    ok: true,
    restoredCardId: latest.card_id,
  };
}
