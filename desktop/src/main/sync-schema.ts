import type { DatabaseSync } from 'node:sqlite';

export function migrateSyncSchema(db: DatabaseSync): void {
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE version = 6').get()) return;
  db.exec('BEGIN');
  try {
    db.exec(`
      ALTER TABLE review_logs ADD COLUMN next_schedule_json TEXT;
      CREATE TABLE review_undos (id TEXT PRIMARY KEY);
      CREATE TABLE card_deletions (headword TEXT PRIMARY KEY, deleted_at TEXT NOT NULL);
      CREATE TABLE review_bases (card_id TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE, schedule_json TEXT NOT NULL);
      CREATE TABLE known_words (headword TEXT PRIMARY KEY, known INTEGER NOT NULL CHECK (known IN (0, 1)), revision INTEGER NOT NULL);
      ALTER TABLE archived_review_stats ADD COLUMN sync_id TEXT;
      ALTER TABLE archived_practice_stats ADD COLUMN sync_id TEXT;
      UPDATE archived_review_stats SET sync_id = lower(hex(randomblob(16)));
      UPDATE archived_practice_stats SET sync_id = lower(hex(randomblob(16)));
      CREATE UNIQUE INDEX archived_review_sync_id ON archived_review_stats(sync_id);
      CREATE UNIQUE INDEX archived_practice_sync_id ON archived_practice_stats(sync_id);

      DROP TRIGGER archive_study_stats;
      CREATE TRIGGER archive_study_stats BEFORE DELETE ON cards BEGIN
        INSERT OR IGNORE INTO archived_review_stats (rating, reviewed_at, duration_ms, sync_id)
          SELECT rating, reviewed_at, duration_ms, id FROM review_logs WHERE card_id = OLD.id;
        INSERT OR IGNORE INTO archived_practice_stats (correct, sync_id)
          SELECT correct, id FROM practice_results WHERE card_id = OLD.id;
      END;

      INSERT INTO review_bases (card_id, schedule_json)
      SELECT card_id, prev_schedule_json FROM review_logs AS first
      WHERE id = (SELECT id FROM review_logs WHERE card_id = first.card_id ORDER BY reviewed_at, rowid LIMIT 1);

      WITH snapshots AS (
        SELECT id, LEAD(prev_schedule_json) OVER (PARTITION BY card_id ORDER BY reviewed_at, rowid) AS next_snapshot
        FROM review_logs
      )
      UPDATE review_logs AS log SET next_schedule_json = COALESCE(
        (SELECT next_snapshot FROM snapshots WHERE id = log.id),
        (SELECT json_object(
          'state', state, 'due_at', due_at, 'stability', stability, 'difficulty', difficulty,
          'elapsed_days', elapsed_days, 'scheduled_days', scheduled_days, 'reps', reps,
          'lapses', lapses, 'learning_steps', learning_steps, 'last_review_at', last_review_at
        ) FROM schedules WHERE card_id = log.card_id)
      );
    `);
    db.prepare('INSERT INTO schema_migrations VALUES (6, ?)').run(new Date().toISOString());
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
