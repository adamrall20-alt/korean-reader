import { randomBytes, timingSafeEqual } from 'node:crypto';

import type { DatabaseSync } from 'node:sqlite';
import type { KnownWordChange } from '../../../types/known-sync';

export function readKnownWords(db: DatabaseSync): KnownWordChange[] {
  const rows = db.prepare('SELECT headword, known, revision FROM known_words ORDER BY headword').all();
  return rows.map((row) => ({ headword: String(row.headword), known: row.known === 1, revision: Number(row.revision) }));
}

export function validateKnownWords(value: unknown): KnownWordChange[] {
  if (!Array.isArray(value) || value.length > 500_000) throw new Error('Invalid Known word list.');
  return value.map((word: KnownWordChange) => {
    if (!word || typeof word.headword !== 'string' || !word.headword.trim() || word.headword.length > 512 ||
        typeof word.known !== 'boolean' || !Number.isSafeInteger(word.revision) || word.revision < 0) {
      throw new Error('Invalid Known word change.');
    }
    return { ...word, headword: word.headword.trim().normalize('NFC') };
  });
}

export function mergeKnownWords(db: DatabaseSync, words: KnownWordChange[]): void {
  const upsert = db.prepare(`
    INSERT INTO known_words VALUES (?, ?, ?)
    ON CONFLICT(headword) DO UPDATE SET known = excluded.known, revision = excluded.revision
    WHERE excluded.revision > known_words.revision
       OR (excluded.revision = known_words.revision AND excluded.known < known_words.known)
  `);
  for (const word of words) upsert.run(word.headword, Number(word.known), word.revision);
}

export function recordMergedKnownCount(db: DatabaseSync, now = new Date()): void {
  const count = Number(db.prepare('SELECT COUNT(*) AS count FROM known_words WHERE known = 1').get()?.count);
  const day = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((part) => String(part).padStart(2, '0')).join('-');
  db.prepare(`INSERT INTO known_word_history VALUES (?, ?, ?)
    ON CONFLICT(day) DO UPDATE SET at = excluded.at, count = excluded.count
    WHERE excluded.at >= known_word_history.at AND excluded.count != known_word_history.count`).run(day, now.getTime(), count);
}

const KNOWN_CODE_KEY = 'chromeKnownLinkCode';

export function getKnownWordsCode(db: DatabaseSync): string {
  const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(KNOWN_CODE_KEY)?.value;
  if (typeof existing === 'string') return existing;
  return resetKnownWordsCode(db);
}

export function resetKnownWordsCode(db: DatabaseSync): string {
  const code = randomBytes(24).toString('base64url');
  db.prepare(`INSERT INTO settings VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .run(KNOWN_CODE_KEY, code, new Date().toISOString());
  return code;
}

export function exchangeKnownWordChanges(db: DatabaseSync, payload: unknown): KnownWordChange[] {
  const request = payload as { code?: unknown; changes?: unknown } | null;
  const stored = db.prepare('SELECT value FROM settings WHERE key = ?').get(KNOWN_CODE_KEY)?.value;
  if (typeof stored !== 'string' || stored.length !== 32 || typeof request?.code !== 'string' ||
      !/^[A-Za-z0-9_-]{32}$/.test(request.code) ||
      !timingSafeEqual(Buffer.from(stored), Buffer.from(request.code))) {
    throw new Error('Invalid Known words code.');
  }
  const changes = validateKnownWords(request.changes);
  db.exec('BEGIN');
  try {
    mergeKnownWords(db, changes);
    if (changes.length) recordMergedKnownCount(db);
    const words = readKnownWords(db);
    db.exec('COMMIT');
    return words;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
