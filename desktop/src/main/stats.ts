import type { DatabaseSync } from 'node:sqlite';
import type { KnownWordHistory, KnownWordPoint } from '../../../types/statistics';
import type { DesktopStudyStats } from '../shared/api';

function dayKey(at: number): string {
  const date = new Date(at);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function isPoint(value: unknown): value is KnownWordPoint {
  if (!value || typeof value !== 'object') return false;
  const { at, count } = value as KnownWordPoint;
  return Number.isSafeInteger(at) && at > 0 && at < 8.64e15 &&
    Number.isSafeInteger(count) && count >= 0;
}

export function saveKnownWordHistory(db: DatabaseSync, raw: unknown): void {
  const history = raw as Partial<KnownWordHistory> | null;
  if (!history || !isPoint(history.baseline) || !Array.isArray(history.days) ||
    history.days.length > 20_000 || !history.days.every(isPoint)) {
    throw new Error('Invalid known-word history.');
  }
  const upsert = db.prepare(`INSERT INTO known_word_history (day, at, count) VALUES (?, ?, ?)
    ON CONFLICT(day) DO UPDATE SET at = excluded.at, count = excluded.count
    WHERE excluded.at >= known_word_history.at`);
  db.exec('BEGIN');
  try {
    for (const point of [history.baseline, ...history.days]) {
      upsert.run(dayKey(point.at), point.at, point.count);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function getStudyStats(db: DatabaseSync, now = new Date()): DesktopStudyStats {
  const knownHistory = db.prepare('SELECT at, count FROM known_word_history ORDER BY at').all() as unknown as KnownWordPoint[];
  const review = db.prepare(`SELECT COUNT(*) AS total, COUNT(duration_ms) AS timed,
    COALESCE(SUM(duration_ms), 0) AS duration, COALESCE(SUM(rating != 1), 0) AS recalled
    FROM study_review_history`).get() as { total: number; timed: number; duration: number; recalled: number };
  const practice = db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(correct), 0) AS correct
    FROM study_practice_history`).get() as { total: number; correct: number };
  const learned = db.prepare('SELECT COUNT(*) AS count FROM schedules WHERE state = 2').get() as { count: number };
  const activity = db.prepare(`SELECT date(at, 'localtime') AS day, COUNT(*) AS count
    FROM study_review_history GROUP BY day ORDER BY day`).all() as Array<{ day: string; count: number }>;
  const reviewsByDay = new Map(activity.map(({ day, count }) => [day, count]));
  const date = new Date(now);
  if (!reviewsByDay.has(dayKey(+date))) date.setDate(date.getDate() - 1);
  let streak = 0;
  while (reviewsByDay.has(dayKey(+date))) {
    streak += 1;
    date.setDate(date.getDate() - 1);
  }
  const recent = new Date(now);
  recent.setDate(recent.getDate() - 29);
  return {
    knownWords: knownHistory.at(-1)?.count ?? null,
    knownHistory,
    totalReviews: review.total,
    timedReviews: review.timed,
    reviewTimeMs: review.duration,
    recallRate: review.total ? review.recalled / review.total : null,
    learnedCards: learned.count,
    streak,
    recentReviews: activity.filter(({ day }) => day >= dayKey(+recent) && day <= dayKey(+now)),
    practiceAnswers: practice.total,
    practiceAccuracy: practice.total ? practice.correct / practice.total : null,
  };
}
