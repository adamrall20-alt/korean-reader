import type { DatabaseSync } from 'node:sqlite';
import type {
  DesktopCardDetail,
  DesktopCardSummary,
  DesktopContextDetail,
  DesktopLibraryStats,
} from '../shared/api';
import type { LocalMediaStore } from './media';

function parseStringArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function listCards(db: DatabaseSync, query?: string): DesktopCardSummary[] {
  const trimmed = typeof query === 'string' ? query.trim() : '';

  const rows = trimmed
    ? (db
        .prepare(
          `SELECT
             c.id,
             c.headword,
             c.pronunciation,
             c.part_of_speech,
             c.frequency_rank,
             c.definitions_json,
             c.korean_definitions_json,
             c.created_at,
             c.updated_at,
             COALESCE(s.state, 0) AS schedule_state,
             COALESCE(s.due_at, c.created_at) AS due_at,
             (SELECT COUNT(*) FROM contexts ctx WHERE ctx.card_id = c.id) AS context_count,
             COALESCE(
               (SELECT sentence FROM contexts ctx WHERE ctx.id = c.preferred_context_id),
               (SELECT sentence FROM contexts ctx WHERE ctx.card_id = c.id ORDER BY ctx.mined_at ASC LIMIT 1),
               ''
             ) AS primary_sentence
           FROM cards c
           LEFT JOIN schedules s ON s.card_id = c.id
           WHERE c.headword LIKE ?
              OR c.definitions_json LIKE ?
              OR EXISTS (
                SELECT 1 FROM contexts ctx
                WHERE ctx.card_id = c.id
                  AND (ctx.sentence LIKE ? OR ctx.original_form LIKE ?)
              )
           ORDER BY c.updated_at DESC, c.headword ASC`,
        )
        .all(`%${trimmed}%`, `%${trimmed}%`, `%${trimmed}%`, `%${trimmed}%`) as Array<Record<string, unknown>>)
    : (db
        .prepare(
          `SELECT
             c.id,
             c.headword,
             c.pronunciation,
             c.part_of_speech,
             c.frequency_rank,
             c.definitions_json,
             c.korean_definitions_json,
             c.created_at,
             c.updated_at,
             COALESCE(s.state, 0) AS schedule_state,
             COALESCE(s.due_at, c.created_at) AS due_at,
             (SELECT COUNT(*) FROM contexts ctx WHERE ctx.card_id = c.id) AS context_count,
             COALESCE(
               (SELECT sentence FROM contexts ctx WHERE ctx.id = c.preferred_context_id),
               (SELECT sentence FROM contexts ctx WHERE ctx.card_id = c.id ORDER BY ctx.mined_at ASC LIMIT 1),
               ''
             ) AS primary_sentence
           FROM cards c
           LEFT JOIN schedules s ON s.card_id = c.id
           ORDER BY c.updated_at DESC, c.headword ASC`,
        )
        .all() as Array<Record<string, unknown>>);

  return rows.map((row) => ({
    id: String(row.id),
    headword: String(row.headword),
    pronunciation: typeof row.pronunciation === 'string' ? row.pronunciation : undefined,
    partOfSpeech: typeof row.part_of_speech === 'string' ? row.part_of_speech : undefined,
    frequencyRank: typeof row.frequency_rank === 'number' ? row.frequency_rank : undefined,
    definitions: parseStringArray(String(row.definitions_json ?? '[]')),
    koreanDefinitions: parseStringArray(String(row.korean_definitions_json ?? '[]')),
    contextCount: Number(row.context_count ?? 0),
    primarySentence: String(row.primary_sentence ?? ''),
    scheduleState: Number(row.schedule_state ?? 0),
    dueAt: String(row.due_at ?? ''),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }));
}

export function getCardDetail(
  db: DatabaseSync,
  mediaStore: LocalMediaStore,
  cardId: string,
): DesktopCardDetail | null {
  const row = db
    .prepare(
      `SELECT
         c.id,
         c.headword,
         c.pronunciation,
         c.part_of_speech,
         c.frequency_rank,
         c.definitions_json,
         c.korean_definitions_json,
         c.preferred_context_id,
         c.anki_note_id,
         c.created_at,
         c.updated_at,
         COALESCE(s.state, 0) AS schedule_state,
         COALESCE(s.due_at, c.created_at) AS due_at,
         COALESCE(s.reps, 0) AS reps,
         COALESCE(s.lapses, 0) AS lapses
       FROM cards c
       LEFT JOIN schedules s ON s.card_id = c.id
       WHERE c.id = ?`,
    )
    .get(cardId) as Record<string, unknown> | undefined;

  if (!row) return null;

  const contextRows = db
    .prepare(
      `SELECT id, sentence, original_form, source_url, source_title,
              timestamp_sec, image_asset_id, audio_asset_id, mined_at
       FROM contexts
       WHERE card_id = ?
       ORDER BY mined_at ASC`,
    )
    .all(cardId) as Array<Record<string, unknown>>;

  const contexts: DesktopContextDetail[] = contextRows.map((ctx) => {
    const imageAssetId = typeof ctx.image_asset_id === 'string' ? ctx.image_asset_id : null;
    const audioAssetId = typeof ctx.audio_asset_id === 'string' ? ctx.audio_asset_id : null;
    return {
      id: String(ctx.id),
      sentence: String(ctx.sentence),
      originalForm: String(ctx.original_form),
      sourceUrl: String(ctx.source_url),
      sourceTitle: String(ctx.source_title),
      timestamp: typeof ctx.timestamp_sec === 'number' ? ctx.timestamp_sec : undefined,
      hasImage: Boolean(imageAssetId),
      hasAudio: Boolean(audioAssetId),
      minedAt: String(ctx.mined_at),
      imageDataUrl: mediaStore.readAsDataUrl(db, imageAssetId),
      audioDataUrl: mediaStore.readAsDataUrl(db, audioAssetId),
    };
  });

  return {
    id: String(row.id),
    headword: String(row.headword),
    pronunciation: typeof row.pronunciation === 'string' ? row.pronunciation : undefined,
    partOfSpeech: typeof row.part_of_speech === 'string' ? row.part_of_speech : undefined,
    frequencyRank: typeof row.frequency_rank === 'number' ? row.frequency_rank : undefined,
    definitions: parseStringArray(String(row.definitions_json ?? '[]')),
    koreanDefinitions: parseStringArray(String(row.korean_definitions_json ?? '[]')),
    preferredContextId:
      typeof row.preferred_context_id === 'string' ? row.preferred_context_id : undefined,
    ankiNoteId: typeof row.anki_note_id === 'number' ? row.anki_note_id : undefined,
    scheduleState: Number(row.schedule_state ?? 0),
    dueAt: String(row.due_at ?? ''),
    reps: Number(row.reps ?? 0),
    lapses: Number(row.lapses ?? 0),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    contexts,
  };
}

export function getLibraryStats(db: DatabaseSync, now = new Date()): DesktopLibraryStats {
  const nowIso = now.toISOString();
  const totalCards = Number(
    ((db.prepare('SELECT COUNT(*) AS count FROM cards').get() as { count?: number })?.count) ?? 0,
  );
  const totalContexts = Number(
    ((db.prepare('SELECT COUNT(*) AS count FROM contexts').get() as { count?: number })?.count) ??
      0,
  );
  const newCards = Number(
    ((db.prepare('SELECT COUNT(*) AS count FROM schedules WHERE state = 0').get() as {
      count?: number;
    })?.count) ?? 0,
  );
  const dueCards = Number(
    ((db
      .prepare('SELECT COUNT(*) AS count FROM schedules WHERE due_at <= ?')
      .get(nowIso) as { count?: number })?.count) ?? 0,
  );
  const mediaAssets = Number(
    ((db.prepare('SELECT COUNT(*) AS count FROM media_assets').get() as { count?: number })
      ?.count) ?? 0,
  );

  return {
    totalCards,
    totalContexts,
    newCards,
    dueCards,
    mediaAssets,
  };
}

export function deleteCard(db: DatabaseSync, cardId: string): boolean {
  const card = db.prepare('SELECT headword FROM cards WHERE id = ?').get(cardId);
  if (typeof card?.headword !== 'string') return false;

  db.exec('BEGIN');
  try {
    db.prepare(`INSERT INTO card_deletions VALUES (?, ?)
      ON CONFLICT(headword) DO UPDATE SET deleted_at = MAX(deleted_at, excluded.deleted_at)`)
      .run(card.headword, new Date().toISOString());
    db.prepare('DELETE FROM cards WHERE id = ?').run(cardId);
    db.exec('COMMIT');
    return true;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
