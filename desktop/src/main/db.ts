import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface DesktopDatabase {
  db: DatabaseSync;
  dbPath: string;
  close(): void;
}

const MIGRATION_V1_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  sha256 TEXT UNIQUE NOT NULL,
  mime_type TEXT NOT NULL,
  rel_path TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  headword TEXT UNIQUE NOT NULL,
  pronunciation TEXT,
  part_of_speech TEXT,
  frequency_rank INTEGER,
  definitions_json TEXT NOT NULL,
  korean_definitions_json TEXT NOT NULL,
  preferred_context_id TEXT,
  anki_note_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contexts (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  sentence TEXT NOT NULL,
  original_form TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_title TEXT NOT NULL,
  timestamp_sec REAL,
  image_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  audio_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  mined_at TEXT NOT NULL,
  UNIQUE(card_id, sentence, source_url)
);

CREATE INDEX IF NOT EXISTS idx_contexts_card_id ON contexts(card_id);

CREATE TABLE IF NOT EXISTS schedules (
  card_id TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
  state INTEGER NOT NULL,
  due_at TEXT NOT NULL,
  stability REAL NOT NULL,
  difficulty REAL NOT NULL,
  elapsed_days INTEGER NOT NULL,
  scheduled_days INTEGER NOT NULL,
  reps INTEGER NOT NULL,
  lapses INTEGER NOT NULL,
  last_review_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_schedules_due_at ON schedules(due_at);

CREATE TABLE IF NOT EXISTS review_logs (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  state INTEGER NOT NULL,
  due_at TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  prev_schedule_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_review_logs_card_id ON review_logs(card_id);

CREATE TABLE IF NOT EXISTS practice_results (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL,
  correct INTEGER NOT NULL,
  answered_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_practice_results_card_id ON practice_results(card_id);
`;

export function openDesktopDatabase(dbPath: string): DesktopDatabase {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }

  runMigrations(db);

  return {
    db,
    dbPath,
    close() {
      db.close();
    },
  };
}

export function runMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedV1 = db
    .prepare('SELECT version FROM schema_migrations WHERE version = 1')
    .get() as { version?: number } | undefined;

  if (!appliedV1) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATION_V1_SQL);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        1,
        new Date().toISOString(),
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  const appliedV2 = db
    .prepare('SELECT version FROM schema_migrations WHERE version = 2')
    .get() as { version?: number } | undefined;

  if (!appliedV2) {
    db.exec('BEGIN');
    try {
      const columns = db.prepare('PRAGMA table_info(schedules)').all() as Array<{ name?: string }>;
      const hasLearningSteps = columns.some((col) => col.name === 'learning_steps');
      if (!hasLearningSteps) {
        db.exec('ALTER TABLE schedules ADD COLUMN learning_steps INTEGER NOT NULL DEFAULT 0;');
      }
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        2,
        new Date().toISOString(),
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  const appliedV3 = db
    .prepare('SELECT version FROM schema_migrations WHERE version = 3')
    .get() as { version?: number } | undefined;

  if (!appliedV3) {
    db.exec('BEGIN');
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        3,
        new Date().toISOString(),
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
