import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { mergeKnownWords, readKnownWords, recordMergedKnownCount, validateKnownWords } from './known-words';
import { restoreLatestSchedule } from './review';

type Cell = string | number | null;
type Row = Record<string, Cell | undefined>;
type Layout = Record<string, 'text' | 'date' | 'number' | 'nullableText' | 'nullableDate' | 'nullableNumber'>;

const layouts = {
  cards: {
    headword: 'text', pronunciation: 'nullableText', part_of_speech: 'nullableText', frequency_rank: 'nullableNumber',
    definitions_json: 'text', korean_definitions_json: 'text', anki_note_id: 'nullableNumber',
    created_at: 'date', updated_at: 'date',
  },
  contexts: {
    sentence: 'text', original_form: 'text', source_url: 'text', source_title: 'text', timestamp_sec: 'nullableNumber',
    image_asset_id: 'nullableText', audio_asset_id: 'nullableText', mined_at: 'date',
  },
  review_logs: {
    id: 'text', rating: 'number', state: 'number', due_at: 'date', reviewed_at: 'date',
    prev_schedule_json: 'text', duration_ms: 'nullableNumber', next_schedule_json: 'text',
  },
  practice_results: { id: 'text', question_type: 'text', correct: 'number', answered_at: 'date' },
  card_deletions: { headword: 'text', deleted_at: 'date' },
  review_undos: { id: 'text' },
  known_word_history: { day: 'text', at: 'number', count: 'number' },
  archived_review_stats: { rating: 'number', reviewed_at: 'date', duration_ms: 'nullableNumber', sync_id: 'text' },
  archived_practice_stats: { correct: 'number', sync_id: 'text' },
  schedules: {
    state: 'number', due_at: 'date', stability: 'number', difficulty: 'number', elapsed_days: 'number',
    scheduled_days: 'number', reps: 'number', lapses: 'number', learning_steps: 'number', last_review_at: 'nullableDate',
  },
} satisfies Record<string, Layout>;

const sharedTables = ['card_deletions', 'review_undos', 'known_word_history', 'archived_review_stats', 'archived_practice_stats'] as const;
const childTables = ['contexts', 'review_logs', 'practice_results'] as const;
type SharedTable = typeof sharedTables[number];
type ChildTable = typeof childTables[number];
interface CardBundle {
  card: Row;
  baseline: Row;
  preferred: number;
  children: Record<ChildTable, Row[]>;
}
export interface LibraryManifest {
  version: 1;
  cards: CardBundle[];
  metadata: Record<SharedTable, Row[]>;
  knownWords: ReturnType<typeof readKnownWords>;
}

function validDate(value: string): boolean {
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

function readRow(value: unknown, layout: Layout): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid library record.');
  const row: Row = {};
  for (const [key, kind] of Object.entries(layout)) {
    const cell = (value as Record<string, unknown>)[key];
    const nullable = kind.startsWith('nullable');
    if (cell === null && nullable) {
      row[key] = null;
    } else if (typeof cell === 'number' && kind.toLowerCase().endsWith('number') && Number.isFinite(cell)) {
      row[key] = cell;
    } else if (typeof cell === 'string' && (kind.toLowerCase().endsWith('text') ||
               (kind.toLowerCase().endsWith('date') && validDate(cell)))) {
      row[key] = kind.toLowerCase().endsWith('date') ? new Date(cell).toISOString() : cell;
    } else {
      throw new Error(`Invalid library field: ${key}.`);
    }
  }
  return row;
}

function readRows(value: unknown, layout: Layout): Row[] {
  if (!Array.isArray(value)) throw new Error('Invalid library record list.');
  return value.map((row) => readRow(row, layout));
}

function definitions(value: Cell | undefined): string[] {
  const list: unknown = JSON.parse(String(value));
  if (!Array.isArray(list) || !list.every((item) => typeof item === 'string')) throw new Error('Invalid card definitions.');
  return list;
}

export function readManifest(value: unknown): LibraryManifest {
  const input = value as LibraryManifest | null;
  if (!input || input.version !== 1 || !input.metadata || !Array.isArray(input.cards)) {
    throw new Error('Unsupported Korean Reader library format.');
  }
  const metadata = {} as LibraryManifest['metadata'];
  for (const table of sharedTables) metadata[table] = readRows(input.metadata[table], layouts[table]);

  const cards = input.cards.map((bundle): CardBundle => {
    const card = readRow(bundle.card, layouts.cards);
    const headword = String(card.headword);
    if (!headword || headword.length > 512 || headword !== headword.trim().normalize('NFC')) throw new Error('Invalid card headword.');
    definitions(card.definitions_json);
    definitions(card.korean_definitions_json);
    const children = {} as CardBundle['children'];
    for (const table of childTables) children[table] = readRows(bundle.children[table], layouts[table]);
    for (const item of children.contexts) {
      for (const hash of [item.image_asset_id, item.audio_asset_id]) {
        if (hash !== null && !/^[a-f0-9]{64}$/.test(String(hash))) throw new Error('Invalid media hash.');
      }
    }
    for (const review of children.review_logs) {
      if (![1, 2, 3, 4].includes(Number(review.rating))) throw new Error('Invalid review rating.');
      readRow(JSON.parse(String(review.next_schedule_json)), layouts.schedules);
      readRow(JSON.parse(String(review.prev_schedule_json)), layouts.schedules);
    }
    if (!Number.isInteger(bundle.preferred) || bundle.preferred < -1 || bundle.preferred >= children.contexts.length) {
      throw new Error('Invalid preferred sentence.');
    }
    return { card, baseline: readRow(bundle.baseline, layouts.schedules), preferred: bundle.preferred, children };
  });
  return { version: 1, cards, metadata, knownWords: validateKnownWords(input.knownWords) };
}

export function createManifest(db: DatabaseSync): LibraryManifest {
  const metadata = {} as LibraryManifest['metadata'];
  for (const table of sharedTables) metadata[table] = db.prepare(`SELECT * FROM ${table}`).all() as Row[];
  const cards = (db.prepare('SELECT * FROM cards ORDER BY headword').all() as Row[]).map((row) => {
    const id = String(row.id);
    const contexts = db.prepare(`
      SELECT ctx.*, image.sha256 AS image_asset_id, audio.sha256 AS audio_asset_id
      FROM contexts ctx LEFT JOIN media_assets image ON ctx.image_asset_id = image.id
      LEFT JOIN media_assets audio ON ctx.audio_asset_id = audio.id WHERE ctx.card_id = ? ORDER BY ctx.rowid
    `).all(id) as Row[];
    const savedBase = db.prepare('SELECT schedule_json FROM review_bases WHERE card_id = ? AND EXISTS (SELECT 1 FROM review_logs WHERE card_id = review_bases.card_id)').get(id);
    const baseline = savedBase
      ? JSON.parse(String(savedBase.schedule_json)) as Row
      : db.prepare('SELECT * FROM schedules WHERE card_id = ?').get(id) as Row;
    return {
      card: readRow(row, layouts.cards),
      baseline: readRow(baseline, layouts.schedules),
      preferred: contexts.findIndex((context) => context.id === row.preferred_context_id),
      children: {
        contexts: readRows(contexts, layouts.contexts),
        review_logs: readRows(db.prepare('SELECT * FROM review_logs WHERE card_id = ?').all(id), layouts.review_logs),
        practice_results: readRows(db.prepare('SELECT * FROM practice_results WHERE card_id = ?').all(id), layouts.practice_results),
      },
    };
  });
  return { version: 1, cards, metadata, knownWords: readKnownWords(db) };
}

export function listManifestMedia(manifest: LibraryManifest): string[] {
  const hashes = new Set<string>();
  for (const bundle of manifest.cards) {
    for (const context of bundle.children.contexts) {
      if (context.image_asset_id) hashes.add(String(context.image_asset_id));
      if (context.audio_asset_id) hashes.add(String(context.audio_asset_id));
    }
  }
  return [...hashes];
}

function insert(db: DatabaseSync, table: string, row: Row, suffix = '') {
  const fields = Object.keys(row);
  return db.prepare(`INSERT INTO ${table} (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')}) ${suffix}`)
    .run(...fields.map((field) => row[field] ?? null));
}

function mergeContext(db: DatabaseSync, cardId: string, context: Row): string {
  const existing = db.prepare('SELECT * FROM contexts WHERE card_id = ? AND sentence = ? AND source_url = ?')
    .get(cardId, String(context.sentence), String(context.source_url)) as Row | undefined;
  const id = String(existing?.id ?? crypto.randomUUID());
  for (const field of ['image_asset_id', 'audio_asset_id']) {
    const hash = context[field];
    const currentHash = db.prepare('SELECT sha256 FROM media_assets WHERE id = ?').get(existing?.[field] ?? null)?.sha256;
    const incoming = db.prepare('SELECT id FROM media_assets WHERE sha256 = ?').get(hash ?? null);
    if (hash && !incoming) throw new Error('A required media file is missing.');
    if (typeof currentHash === 'string' && (!hash || currentHash <= String(hash))) {
      context[field] = existing![field];
    } else {
      context[field] = incoming?.id as string | undefined ?? null;
    }
  }
  const contextFields = ['mined_at', 'original_form', 'source_title', 'timestamp_sec'];
  const writeRemote = !existing || compareRows(context, existing, contextFields) > 0;
  const chosen = writeRemote ? context : existing;
  insert(db, 'contexts', { ...readRow(chosen, layouts.contexts), image_asset_id: context.image_asset_id,
    audio_asset_id: context.audio_asset_id, id, card_id: cardId },
  `ON CONFLICT(id) DO UPDATE SET mined_at = excluded.mined_at, original_form = excluded.original_form,
    source_title = excluded.source_title, timestamp_sec = excluded.timestamp_sec,
    image_asset_id = excluded.image_asset_id, audio_asset_id = excluded.audio_asset_id`);
  return id;
}

function compareRows(left: Row, right: Row, keys: string[]): number {
  const first = JSON.stringify(keys.map((key) => left[key]));
  const second = JSON.stringify(keys.map((key) => right[key]));
  return first === second ? 0 : first > second ? 1 : -1;
}

function compareBaselines(left: Row, right: Row): number {
  const reviewOrder = String(left.last_review_at ?? '').localeCompare(String(right.last_review_at ?? ''));
  return reviewOrder || Number(left.reps) - Number(right.reps) || compareRows(left, right, Object.keys(layouts.schedules));
}

function mergeCard(db: DatabaseSync, bundle: CardBundle): void {
  const incoming = bundle.card;
  const deletion = db.prepare('SELECT deleted_at FROM card_deletions WHERE headword = ?').get(String(incoming.headword));
  if (typeof deletion?.deleted_at === 'string' && deletion.deleted_at >= String(incoming.created_at)) {
    for (const row of bundle.children.review_logs) {
      insert(db, 'archived_review_stats', {
        sync_id: row.id, rating: row.rating, reviewed_at: row.reviewed_at, duration_ms: row.duration_ms,
      }, 'ON CONFLICT(sync_id) DO NOTHING');
    }
    for (const row of bundle.children.practice_results) {
      insert(db, 'archived_practice_stats', { sync_id: row.id, correct: row.correct }, 'ON CONFLICT(sync_id) DO NOTHING');
    }
    return;
  }
  const local = db.prepare('SELECT * FROM cards WHERE headword = ?').get(String(incoming.headword)) as Row | undefined;
  const id = String(local?.id ?? crypto.randomUUID());
  const fields = ['updated_at', 'pronunciation', 'part_of_speech', 'frequency_rank', 'anki_note_id'];
  const remoteWins = !local || compareRows(incoming, local, fields) > 0;
  const card = readRow(remoteWins ? incoming : local, layouts.cards);
  if (local) {
    card.created_at = String(local.created_at) < String(incoming.created_at) ? local.created_at : incoming.created_at;
    for (const field of ['definitions_json', 'korean_definitions_json']) {
      card[field] = JSON.stringify([...new Set([...definitions(local[field]), ...definitions(incoming[field])])].sort());
    }
  }
  insert(db, 'cards', { ...card, id }, `ON CONFLICT(id) DO UPDATE SET
    pronunciation = excluded.pronunciation, part_of_speech = excluded.part_of_speech, frequency_rank = excluded.frequency_rank,
    definitions_json = excluded.definitions_json, korean_definitions_json = excluded.korean_definitions_json,
    anki_note_id = excluded.anki_note_id, created_at = excluded.created_at, updated_at = excluded.updated_at`);

  const contextIds = bundle.children.contexts.map((context) => mergeContext(db, id, { ...context }));
  const remotePreferred = contextIds[bundle.preferred];
  const localPreferred = local?.preferred_context_id;
  let preferred = remoteWins ? remotePreferred ?? localPreferred : localPreferred ?? remotePreferred;
  if (local && remotePreferred && localPreferred && compareRows(incoming, local, fields) === 0) {
    preferred = db.prepare(`SELECT id FROM contexts WHERE id IN (?, ?) ORDER BY sentence, source_url LIMIT 1`)
      .get(remotePreferred, localPreferred)?.id as string;
  }
  db.prepare('UPDATE cards SET preferred_context_id = ? WHERE id = ?').run(preferred ?? null, id);

  const savedBase = db.prepare('SELECT schedule_json FROM review_bases WHERE card_id = ? AND EXISTS (SELECT 1 FROM review_logs WHERE card_id = review_bases.card_id)').get(id)?.schedule_json;
  const localBase = typeof savedBase === 'string' ? JSON.parse(savedBase) as Row :
    db.prepare('SELECT * FROM schedules WHERE card_id = ?').get(id) as Row | undefined;
  const base = localBase && compareBaselines(localBase, bundle.baseline) >= 0 ? localBase : bundle.baseline;
  insert(db, 'review_bases', { card_id: id, schedule_json: JSON.stringify(readRow(base, layouts.schedules)) },
    'ON CONFLICT(card_id) DO UPDATE SET schedule_json = excluded.schedule_json');
  for (const row of bundle.children.review_logs) {
    if (!db.prepare('SELECT 1 FROM review_undos WHERE id = ?').get(String(row.id))) {
      insert(db, 'review_logs', { ...row, card_id: id }, 'ON CONFLICT(id) DO NOTHING');
    }
  }
  for (const row of bundle.children.practice_results) {
    insert(db, 'practice_results', { ...row, card_id: id }, 'ON CONFLICT(id) DO NOTHING');
  }
  restoreLatestSchedule(db, id);
}

export function mergeManifest(db: DatabaseSync, manifest: LibraryManifest): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    const conflict: Record<SharedTable, string> = {
      card_deletions: 'ON CONFLICT(headword) DO UPDATE SET deleted_at = MAX(deleted_at, excluded.deleted_at)',
      review_undos: 'ON CONFLICT(id) DO NOTHING',
      known_word_history: `ON CONFLICT(day) DO UPDATE SET at = excluded.at, count = excluded.count
        WHERE excluded.at > at OR (excluded.at = at AND excluded.count > count)`,
      archived_review_stats: 'ON CONFLICT(sync_id) DO NOTHING',
      archived_practice_stats: 'ON CONFLICT(sync_id) DO NOTHING',
    };
    for (const table of sharedTables) {
      for (const row of manifest.metadata[table]) insert(db, table, row, conflict[table]);
    }
    const undoneCards = db.prepare('SELECT DISTINCT card_id FROM review_logs WHERE id IN (SELECT id FROM review_undos)').all();
    db.exec(`
      DELETE FROM review_logs WHERE id IN (SELECT id FROM review_undos);
      DELETE FROM cards WHERE EXISTS (SELECT 1 FROM card_deletions WHERE headword = cards.headword AND deleted_at >= cards.created_at);
    `);
    for (const { card_id } of undoneCards) {
      if (db.prepare('SELECT 1 FROM cards WHERE id = ?').get(String(card_id))) restoreLatestSchedule(db, String(card_id));
    }
    for (const bundle of manifest.cards) mergeCard(db, bundle);
    db.exec(`
      DELETE FROM archived_review_stats WHERE sync_id IN (SELECT id FROM review_logs UNION SELECT id FROM review_undos);
      DELETE FROM archived_practice_stats WHERE sync_id IN (SELECT id FROM practice_results);
    `);
    mergeKnownWords(db, manifest.knownWords);
    if (db.prepare('SELECT 1 FROM known_words LIMIT 1').get()) recordMergedKnownCount(db);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
