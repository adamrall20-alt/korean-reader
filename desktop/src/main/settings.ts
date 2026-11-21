import type { DatabaseSync } from 'node:sqlite';
import type { DesktopReviewSettings } from '../shared/api';

export const DEFAULT_REVIEW_SETTINGS: DesktopReviewSettings = {
  dailyNewLimit: 20,
  dailyReviewLimit: 200,
};

function clampLimit(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(9999, Math.max(0, Math.round(value)));
}

function parseStoredInt(raw: string | undefined, fallback: number): number {
  if (typeof raw !== 'string') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return clampLimit(parsed, fallback);
}

export function getReviewSettings(db: DatabaseSync): DesktopReviewSettings {
  const rows = db
    .prepare('SELECT key, value FROM settings WHERE key IN (?, ?)')
    .all('dailyNewLimit', 'dailyReviewLimit') as Array<{ key?: string; value?: string }>;

  const map = new Map<string, string>();
  for (const row of rows) {
    if (typeof row.key === 'string' && typeof row.value === 'string') {
      map.set(row.key, row.value);
    }
  }

  return {
    dailyNewLimit: parseStoredInt(map.get('dailyNewLimit'), DEFAULT_REVIEW_SETTINGS.dailyNewLimit),
    dailyReviewLimit: parseStoredInt(
      map.get('dailyReviewLimit'),
      DEFAULT_REVIEW_SETTINGS.dailyReviewLimit,
    ),
  };
}

export function saveReviewSettings(
  db: DatabaseSync,
  patch: Partial<DesktopReviewSettings>,
): DesktopReviewSettings {
  const current = getReviewSettings(db);
  const next: DesktopReviewSettings = {
    dailyNewLimit:
      patch.dailyNewLimit !== undefined
        ? clampLimit(patch.dailyNewLimit, current.dailyNewLimit)
        : current.dailyNewLimit,
    dailyReviewLimit:
      patch.dailyReviewLimit !== undefined
        ? clampLimit(patch.dailyReviewLimit, current.dailyReviewLimit)
        : current.dailyReviewLimit,
  };

  const nowIso = new Date().toISOString();
  const upsertStmt = db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
  );

  db.exec('BEGIN');
  try {
    upsertStmt.run('dailyNewLimit', String(next.dailyNewLimit), nowIso);
    upsertStmt.run('dailyReviewLimit', String(next.dailyReviewLimit), nowIso);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return next;
}
