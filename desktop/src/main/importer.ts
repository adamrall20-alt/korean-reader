import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { createEmptyCard } from 'ts-fsrs';
import type { ImportSummary } from '../shared/api';
import type { LocalMediaStore } from './media';

interface RawContext {
  sentence?: unknown;
  originalForm?: unknown;
  sourceUrl?: unknown;
  sourceTitle?: unknown;
  timestamp?: unknown;
  image?: unknown;
  audio?: unknown;
  minedAt?: unknown;
}

interface RawVocabularyEntry {
  headword?: unknown;
  originalForm?: unknown;
  pronunciation?: unknown;
  partOfSpeech?: unknown;
  frequencyRank?: unknown;
  definitions?: unknown;
  koreanDefinitions?: unknown;
  contexts?: unknown;
  ankiNoteId?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

function normalizeHeadword(value: string): string {
  return value.trim().normalize('NFC');
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function toOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toOptionalNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function toIsoTimestamp(value: unknown, fallback: string): string {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return value;
  }
  return fallback;
}

export function importVocabularyJson(
  db: DatabaseSync,
  mediaStore: LocalMediaStore,
  rawJson: string,
  now = new Date(),
): ImportSummary {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Expected a JSON array exported from Korean Reader.');
  }

  const nowIso = now.toISOString();
  let cardsAdded = 0;
  let cardsUpdated = 0;
  let contextsAdded = 0;
  let contextsUpdated = 0;
  let skippedKnownOnly = 0;
  let skippedInvalid = 0;
  let mediaSaved = 0;

  const findCardStmt = db.prepare(
    'SELECT id, preferred_context_id FROM cards WHERE headword = ?',
  );
  const insertCardStmt = db.prepare(
    `INSERT INTO cards (
       id, headword, pronunciation, part_of_speech, frequency_rank,
       definitions_json, korean_definitions_json, preferred_context_id,
       anki_note_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateCardStmt = db.prepare(
    `UPDATE cards
     SET pronunciation = COALESCE(?, pronunciation),
         part_of_speech = COALESCE(?, part_of_speech),
         frequency_rank = COALESCE(?, frequency_rank),
         definitions_json = ?,
         korean_definitions_json = ?,
         anki_note_id = COALESCE(?, anki_note_id),
         updated_at = ?
     WHERE id = ?`,
  );
  const setPreferredContextStmt = db.prepare(
    'UPDATE cards SET preferred_context_id = ? WHERE id = ? AND preferred_context_id IS NULL',
  );
  const findContextStmt = db.prepare(
    `SELECT id, image_asset_id, audio_asset_id
     FROM contexts
     WHERE card_id = ? AND sentence = ? AND source_url = ?`,
  );
  const insertContextStmt = db.prepare(
    `INSERT INTO contexts (
       id, card_id, sentence, original_form, source_url, source_title,
       timestamp_sec, image_asset_id, audio_asset_id, mined_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateContextMediaStmt = db.prepare(
    `UPDATE contexts
     SET image_asset_id = COALESCE(image_asset_id, ?),
         audio_asset_id = COALESCE(audio_asset_id, ?)
     WHERE id = ?`,
  );
  const insertScheduleStmt = db.prepare(
    `INSERT OR IGNORE INTO schedules (
       card_id, state, due_at, stability, difficulty,
       elapsed_days, scheduled_days, reps, lapses, last_review_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  db.exec('BEGIN');
  try {
    for (const item of parsed) {
      if (!item || typeof item !== 'object') {
        skippedInvalid += 1;
        continue;
      }

      const raw = item as RawVocabularyEntry;
      if (typeof raw.headword !== 'string' || normalizeHeadword(raw.headword).length === 0) {
        skippedInvalid += 1;
        continue;
      }

      const headword = normalizeHeadword(raw.headword);
      const rawContexts = Array.isArray(raw.contexts) ? (raw.contexts as RawContext[]) : [];

      if (rawContexts.length === 0) {
        skippedKnownOnly += 1;
        continue;
      }

      const validContexts = rawContexts
        .filter((ctx): ctx is RawContext => Boolean(ctx && typeof ctx === 'object'))
        .map((ctx) => {
          const sentence = typeof ctx.sentence === 'string' ? ctx.sentence.trim() : '';
          const sourceUrl = typeof ctx.sourceUrl === 'string' ? ctx.sourceUrl.trim() : '';
          const sourceTitle =
            typeof ctx.sourceTitle === 'string' && ctx.sourceTitle.trim().length > 0
              ? ctx.sourceTitle.trim()
              : sourceUrl || 'Unknown source';
          const originalForm =
            typeof ctx.originalForm === 'string' && ctx.originalForm.trim().length > 0
              ? ctx.originalForm.trim()
              : headword;
          const timestamp = toOptionalNumber(ctx.timestamp);
          const image = typeof ctx.image === 'string' ? ctx.image : null;
          const audio = typeof ctx.audio === 'string' ? ctx.audio : null;
          const minedAt = toIsoTimestamp(ctx.minedAt, nowIso);
          return { sentence, sourceUrl, sourceTitle, originalForm, timestamp, image, audio, minedAt };
        })
        .filter((ctx) => ctx.sentence.length > 0);

      if (validContexts.length === 0) {
        skippedInvalid += 1;
        continue;
      }

      const definitions = toStringArray(raw.definitions);
      const koreanDefinitions = toStringArray(raw.koreanDefinitions);
      const pronunciation = toOptionalString(raw.pronunciation);
      const partOfSpeech = toOptionalString(raw.partOfSpeech);
      const frequencyRank = toOptionalNumber(raw.frequencyRank);
      const ankiNoteId = toOptionalNumber(raw.ankiNoteId);
      const createdAt = toIsoTimestamp(raw.createdAt, nowIso);
      const updatedAt = toIsoTimestamp(raw.updatedAt, nowIso);

      const existingCard = findCardStmt.get(headword) as
        | { id?: string; preferred_context_id?: string | null }
        | undefined;

      let cardId: string;
      let firstContextId: string | null = existingCard?.preferred_context_id ?? null;

      if (!existingCard?.id) {
        cardId = crypto.randomUUID();
        insertCardStmt.run(
          cardId,
          headword,
          pronunciation,
          partOfSpeech,
          frequencyRank,
          JSON.stringify(definitions),
          JSON.stringify(koreanDefinitions),
          null,
          ankiNoteId,
          createdAt,
          updatedAt,
        );

        const emptyFsrs = createEmptyCard(now);
        insertScheduleStmt.run(
          cardId,
          emptyFsrs.state ?? 0,
          emptyFsrs.due.toISOString(),
          emptyFsrs.stability ?? 0,
          emptyFsrs.difficulty ?? 0,
          0,
          emptyFsrs.scheduled_days ?? 0,
          emptyFsrs.reps ?? 0,
          emptyFsrs.lapses ?? 0,
          null,
        );
        cardsAdded += 1;
      } else {
        cardId = existingCard.id;
        updateCardStmt.run(
          pronunciation,
          partOfSpeech,
          frequencyRank,
          JSON.stringify(definitions),
          JSON.stringify(koreanDefinitions),
          ankiNoteId,
          updatedAt,
          cardId,
        );
        cardsUpdated += 1;
      }

      for (const ctx of validContexts) {
        const existingCtx = findContextStmt.get(cardId, ctx.sentence, ctx.sourceUrl) as
          | { id?: string; image_asset_id?: string | null; audio_asset_id?: string | null }
          | undefined;

        let imageAssetId: string | null = null;
        if (ctx.image && (!existingCtx || !existingCtx.image_asset_id)) {
          const saved = mediaStore.saveDataUrl(db, ctx.image);
          if (saved) {
            imageAssetId = saved.id;
            if (saved.created) mediaSaved += 1;
          }
        }

        let audioAssetId: string | null = null;
        if (ctx.audio && (!existingCtx || !existingCtx.audio_asset_id)) {
          const saved = mediaStore.saveDataUrl(db, ctx.audio);
          if (saved) {
            audioAssetId = saved.id;
            if (saved.created) mediaSaved += 1;
          }
        }

        if (!existingCtx?.id) {
          const ctxId = crypto.randomUUID();
          insertContextStmt.run(
            ctxId,
            cardId,
            ctx.sentence,
            ctx.originalForm,
            ctx.sourceUrl,
            ctx.sourceTitle,
            ctx.timestamp,
            imageAssetId,
            audioAssetId,
            ctx.minedAt,
          );
          if (!firstContextId) {
            firstContextId = ctxId;
          }
          contextsAdded += 1;
        } else if (
          (!existingCtx.image_asset_id && imageAssetId) ||
          (!existingCtx.audio_asset_id && audioAssetId)
        ) {
          updateContextMediaStmt.run(imageAssetId, audioAssetId, existingCtx.id);
          contextsUpdated += 1;
        }
      }

      if (firstContextId) {
        setPreferredContextStmt.run(firstContextId, cardId);
      }
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  const totalRow = db.prepare('SELECT COUNT(*) AS count FROM cards').get() as { count?: number };
  return {
    cardsAdded,
    cardsUpdated,
    contextsAdded,
    contextsUpdated,
    skippedKnownOnly,
    skippedInvalid,
    mediaSaved,
    totalCards: Number(totalRow?.count ?? 0),
  };
}
