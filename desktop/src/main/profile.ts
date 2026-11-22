import type { DatabaseSync } from 'node:sqlite';
import { DEFAULT_USERNAME, MAX_USERNAME_LENGTH } from '../shared/profile';

const USERNAME_KEY = 'profileUsername';

export function getProfileUsername(db: DatabaseSync): string {
  const name = db.prepare('SELECT value FROM settings WHERE key = ?').get(USERNAME_KEY)?.value;
  return typeof name === 'string' ? name : DEFAULT_USERNAME;
}

export function saveProfileUsername(db: DatabaseSync, input: unknown): string {
  const name = typeof input === 'string' ? input.trim().normalize('NFC') : '';
  if (!name || name.length > MAX_USERNAME_LENGTH || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(name)) {
    throw new Error(`Enter a username between 1 and ${MAX_USERNAME_LENGTH} characters on one line.`);
  }
  db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .run(USERNAME_KEY, name, new Date().toISOString());
  return name;
}
