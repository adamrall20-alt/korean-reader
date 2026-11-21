import type { DatabaseSync } from 'node:sqlite';
import type { AnkiImportProgress, ImportSummary } from '../shared/api';
import { importVocabularyJson, type ImportedSchedule } from './importer';
import type { LocalMediaStore } from './media';

export const DEFAULT_ANKI_CONNECT_URL = 'http://127.0.0.1:8765';
const NOTES_BATCH_SIZE = 100;

interface AnkiConnectResponse<T> {
  result: T;
  error: string | null;
}

interface AnkiNoteInfo {
  noteId: number;
  modelName?: string;
  cards?: number[];
  fields?: Record<string, { value?: string; order?: number }>;
}

export interface AnkiCardInfo {
  cardId: number;
  note?: number;
  type?: number; // 0 = New, 1 = Learning, 2 = Review, 3 = Relearning
  queue?: number;
  due?: number;
  interval?: number;
  factor?: number; // ease factor * 1000 (e.g. 2500)
  reps?: number;
  lapses?: number;
  left?: number;
  mod?: number; // last modified Unix timestamp in seconds
}

function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

export function mapAnkiCardToSchedule(card: AnkiCardInfo, now = new Date()): ImportedSchedule {
  const nowIso = now.toISOString();
  const type = typeof card.type === 'number' && card.type >= 0 && card.type <= 3 ? card.type : 0;
  const reps = typeof card.reps === 'number' && card.reps > 0 ? Math.round(card.reps) : 0;
  const lapses = typeof card.lapses === 'number' && card.lapses > 0 ? Math.round(card.lapses) : 0;
  const interval = typeof card.interval === 'number' && Number.isFinite(card.interval) ? card.interval : 0;
  const factor = typeof card.factor === 'number' && card.factor > 0 ? card.factor : 2500;
  const modSec = typeof card.mod === 'number' && card.mod > 1_000_000_000 ? card.mod : 0;

  if (type === 0 && reps === 0) {
    return {
      state: 0,
      dueAt: nowIso,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      learningSteps: 0,
      lastReviewAt: null,
    };
  }

  // Map Anki ease factor (default 2500, range ~1300-3500) to FSRS difficulty (1-10, default ~5)
  const difficulty = Math.round(clamp(1, 10, 5 + (2500 - factor) / 250) * 100) / 100;
  const lastReviewMs = modSec > 0 ? modSec * 1000 : now.getTime();
  const lastReviewAt = new Date(lastReviewMs).toISOString();
  const elapsedDays = Math.max(0, Math.round((now.getTime() - lastReviewMs) / 86_400_000));

  if (type === 2) {
    const scheduledDays = Math.max(1, Math.round(interval));
    // In FSRS at R=0.9, stability S equals the interval in days at 90% retrievability.
    const stability = Math.max(0.1, scheduledDays);
    const dueMs = lastReviewMs + scheduledDays * 86_400_000;
    return {
      state: 2,
      dueAt: new Date(dueMs).toISOString(),
      stability,
      difficulty,
      elapsedDays,
      scheduledDays,
      reps: Math.max(1, reps),
      lapses,
      learningSteps: 0,
      lastReviewAt,
    };
  }

  // Learning (1) or Relearning (3)
  const dueSec = typeof card.due === 'number' && card.due > 1_000_000_000 ? card.due : 0;
  const dueAt = dueSec > 0 ? new Date(dueSec * 1000).toISOString() : nowIso;
  const stability = Math.max(0.1, interval > 0 ? interval : 0.5);

  return {
    state: type,
    dueAt,
    stability,
    difficulty,
    elapsedDays,
    scheduledDays: Math.max(0, Math.round(interval)),
    reps,
    lapses,
    learningSteps: 0,
    lastReviewAt: modSec > 0 ? lastReviewAt : null,
  };
}

function pickPrimaryCard(cards: AnkiCardInfo[]): AnkiCardInfo | null {
  if (cards.length === 0) return null;
  return [...cards].sort((a, b) => {
    const typeDiff = (b.type ?? 0) - (a.type ?? 0);
    if (typeDiff !== 0) return typeDiff;
    const ivlDiff = (b.interval ?? 0) - (a.interval ?? 0);
    if (ivlDiff !== 0) return ivlDiff;
    return (b.reps ?? 0) - (a.reps ?? 0);
  })[0]!;
}

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
  m4a: 'audio/mp4',
};

async function invokeAnkiConnect<T>(
  action: string,
  params: Record<string, unknown> = {},
  endpoint = DEFAULT_ANKI_CONNECT_URL,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, version: 6, params }),
    });
  } catch {
    throw new Error('Could not connect to AnkiConnect. Make sure Anki Desktop is open.');
  }

  if (!response.ok) {
    throw new Error(`AnkiConnect returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as AnkiConnectResponse<T>;
  if (payload.error) {
    throw new Error(payload.error);
  }
  return payload.result;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripHtml(input: string): string {
  return decodeHtmlEntities(
    input
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p|li)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeFieldKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, '');
}

function findFieldValue(
  fields: Record<string, { value?: string }>,
  candidates: string[],
): string {
  const lowerMap = new Map<string, string>();
  for (const [key, entry] of Object.entries(fields)) {
    if (typeof entry?.value === 'string') {
      lowerMap.set(normalizeFieldKey(key), entry.value);
    }
  }
  for (const candidate of candidates) {
    const val = lowerMap.get(normalizeFieldKey(candidate));
    if (val && val.trim().length > 0) return val;
  }
  return '';
}

function extractImageFilename(fields: Record<string, { value?: string }>): string | null {
  const preferred = findFieldValue(fields, ['Image', 'Picture', 'Screenshot', 'Snapshot']);
  const sources = preferred
    ? [preferred]
    : Object.values(fields).map((f) => f?.value ?? '');

  for (const raw of sources) {
    const match = /<img[^>]+src=["']([^"']+)["']/i.exec(raw);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function extractAudioFilename(fields: Record<string, { value?: string }>): string | null {
  const preferred = findFieldValue(fields, ['Audio', 'Sentence Audio', 'SentenceAudio', 'Sound', 'Word Audio']);
  const sources = preferred
    ? [preferred]
    : Object.values(fields).map((f) => f?.value ?? '');

  for (const raw of sources) {
    const match = /\[sound:([^\]]+)\]/i.exec(raw);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function mimeFromFilename(filename: string, fallback: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_MIME[ext] ?? fallback;
}

export async function listAnkiDecks(
  endpoint = DEFAULT_ANKI_CONNECT_URL,
): Promise<string[]> {
  const decks = await invokeAnkiConnect<string[]>('deckNames', {}, endpoint);
  return [...decks].sort((a, b) => a.localeCompare(b));
}

export async function importAnkiDeck(options: {
  db: DatabaseSync;
  mediaStore: LocalMediaStore;
  deckName: string;
  endpoint?: string;
  onProgress?: (progress: AnkiImportProgress) => void;
}): Promise<ImportSummary> {
  const { db, mediaStore, deckName, endpoint = DEFAULT_ANKI_CONNECT_URL, onProgress } = options;
  const escapedDeck = deckName.replace(/[\\"*_]/g, '\\$&');
  const noteIds = await invokeAnkiConnect<number[]>(
    'findNotes',
    { query: `"deck:${escapedDeck}"` },
    endpoint,
  );

  const totalNotes = noteIds.length;
  onProgress?.({ phase: 'fetching', processed: 0, total: totalNotes });

  if (totalNotes === 0) {
    const totalRow = db.prepare('SELECT COUNT(*) AS count FROM cards').get() as { count?: number };
    return {
      cardsAdded: 0,
      cardsUpdated: 0,
      contextsAdded: 0,
      contextsUpdated: 0,
      skippedKnownOnly: 0,
      skippedInvalid: 0,
      mediaSaved: 0,
      totalCards: Number(totalRow?.count ?? 0),
    };
  }

  const mediaCache = new Map<string, string | null>();
  async function fetchMediaDataUrl(filename: string, fallbackMime: string): Promise<string | undefined> {
    if (mediaCache.has(filename)) {
      return mediaCache.get(filename) ?? undefined;
    }
    try {
      const base64 = await invokeAnkiConnect<string | false>(
        'retrieveMediaFile',
        { filename },
        endpoint,
      );
      if (typeof base64 === 'string' && base64.length > 0) {
        const dataUrl = `data:${mimeFromFilename(filename, fallbackMime)};base64,${base64}`;
        mediaCache.set(filename, dataUrl);
        return dataUrl;
      }
    } catch {
      // Missing media file in Anki should not abort the note import.
    }
    mediaCache.set(filename, null);
    return undefined;
  }

  const totals: ImportSummary = {
    cardsAdded: 0,
    cardsUpdated: 0,
    contextsAdded: 0,
    contextsUpdated: 0,
    skippedKnownOnly: 0,
    skippedInvalid: 0,
    mediaSaved: 0,
    totalCards: 0,
  };

  for (let i = 0; i < noteIds.length; i += NOTES_BATCH_SIZE) {
    const batchIds = noteIds.slice(i, i + NOTES_BATCH_SIZE);
    const notes = await invokeAnkiConnect<AnkiNoteInfo[]>(
      'notesInfo',
      { notes: batchIds },
      endpoint,
    );

    const cardIdsByNote = new Map<number, number[]>();
    const allBatchCardIds: number[] = [];
    for (const note of notes) {
      if (Array.isArray(note.cards) && note.cards.length > 0) {
        const validIds = note.cards.filter((id): id is number => typeof id === 'number');
        if (validIds.length > 0) {
          cardIdsByNote.set(note.noteId, validIds);
          allBatchCardIds.push(...validIds);
        }
      }
    }

    const cardsById = new Map<number, AnkiCardInfo>();
    if (allBatchCardIds.length > 0) {
      try {
        const cardsInfo = await invokeAnkiConnect<AnkiCardInfo[]>(
          'cardsInfo',
          { cards: allBatchCardIds },
          endpoint,
        );
        for (const card of cardsInfo) {
          if (card && typeof card.cardId === 'number') {
            cardsById.set(card.cardId, card);
          }
        }
      } catch {
        // If cardsInfo is unavailable, continue importing notes with default schedules.
      }
    }

    const convertedEntries: unknown[] = [];

    for (const note of notes) {
      const fields = note.fields ?? {};
      const rawFocus = findFieldValue(fields, [
        'Focus Word',
        'Word',
        'Expression',
        'Vocabulary',
        'Korean',
        'Front',
      ]);
      const headword =
        stripHtml(rawFocus.replace(/\[sound:[^\]]*\]/gi, ''))
          .split('\n')[0]
          ?.trim()
          .normalize('NFC') ?? '';
      if (!headword) {
        totals.skippedInvalid += 1;
        continue;
      }

      const rawSentence = findFieldValue(fields, ['Sentence', 'Example', 'Context', 'Expression']);
      const sentenceLines = stripHtml(rawSentence)
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const sentences = sentenceLines.length > 0 ? sentenceLines : [headword];

      const rawDef = findFieldValue(fields, ['Definition', 'Meaning', 'Glossary', 'English', 'Back']);
      const definitions = stripHtml(rawDef)
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      const rawPronunciation = findFieldValue(fields, ['Pronunciation', 'Reading']);
      const pronunciation = stripHtml(rawPronunciation) || undefined;

      const imageFilename = extractImageFilename(fields);
      const audioFilename = extractAudioFilename(fields);

      const [imageDataUrl, audioDataUrl] = await Promise.all([
        imageFilename ? fetchMediaDataUrl(imageFilename, 'image/jpeg') : Promise.resolve(undefined),
        audioFilename ? fetchMediaDataUrl(audioFilename, 'audio/mpeg') : Promise.resolve(undefined),
      ]);

      const nowIso = new Date().toISOString();
      const contexts = sentences.map((sentence, idx) => ({
        sentence,
        originalForm: headword,
        sourceUrl: '',
        sourceTitle: `Anki: ${deckName}`,
        image: idx === 0 ? imageDataUrl : undefined,
        audio: idx === 0 ? audioDataUrl : undefined,
        minedAt: nowIso,
      }));

      const noteCardIds = cardIdsByNote.get(note.noteId) ?? [];
      const noteCards = noteCardIds
        .map((id) => cardsById.get(id))
        .filter((c): c is AnkiCardInfo => Boolean(c));
      const primaryCard = pickPrimaryCard(noteCards);
      const schedule = primaryCard ? mapAnkiCardToSchedule(primaryCard) : undefined;

      convertedEntries.push({
        headword,
        originalForm: headword,
        pronunciation,
        definitions,
        koreanDefinitions: [],
        ankiNoteId: note.noteId,
        schedule,
        contexts,
        status: 'known',
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    if (convertedEntries.length > 0) {
      const batchSummary = importVocabularyJson(db, mediaStore, JSON.stringify(convertedEntries));
      totals.cardsAdded += batchSummary.cardsAdded;
      totals.cardsUpdated += batchSummary.cardsUpdated;
      totals.contextsAdded += batchSummary.contextsAdded;
      totals.contextsUpdated += batchSummary.contextsUpdated;
      totals.skippedKnownOnly += batchSummary.skippedKnownOnly;
      totals.skippedInvalid += batchSummary.skippedInvalid;
      totals.mediaSaved += batchSummary.mediaSaved;
      totals.totalCards = batchSummary.totalCards;
    }

    onProgress?.({
      phase: 'importing',
      processed: Math.min(i + batchIds.length, totalNotes),
      total: totalNotes,
    });
  }

  const totalRow = db.prepare('SELECT COUNT(*) AS count FROM cards').get() as { count?: number };
  totals.totalCards = Number(totalRow?.count ?? totals.totalCards);
  return totals;
}
