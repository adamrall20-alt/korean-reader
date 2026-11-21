import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { zstdDecompressSync } from 'node:zlib';
import { unzipSync } from 'fflate';
import type { ImportSummary } from '../shared/api';
import { importVocabularyEntries, type ImportedSchedule } from './importer';
import type { LocalMediaStore } from './media';

const MIB = 1024 * 1024;
const MAX_PACKAGE = 1024 * MIB;
const MAX_MEDIA = 25 * MIB;

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

function extractHighlightedForm(rawHtml: string): string | null {
  const match = /<(?:span|b|strong|mark)\b[^>]*>([\s\S]*?)<\/(?:span|b|strong|mark)>/i.exec(rawHtml);
  if (!match?.[1]) return null;
  const cleaned = stripHtml(match[1]).replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : null;
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

interface AnkiCardRow {
  nid: number;
  did: number;
  odid: number;
  type: number;
  due: number;
  odue: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
  mod: number;
  last_review: number | null;
  data: string;
}

interface NoteField { name: string; ord: number }
interface PackageEntry {
  headword: string;
  pronunciation?: string;
  definitions: string[];
  ankiNoteId: number;
  schedule?: ImportedSchedule;
  context: { originalForm: string; sentence: string; sourceUrl: string; sourceTitle: string; minedAt: string };
  image: string | null;
  audio: string | null;
}

// The modern package media index is a protobuf list of length-delimited entries.
function* protobufBytes(buffer: Uint8Array, matchField: number): Generator<Uint8Array> {
  let offset = 0;
  function varint(): number {
    let result = 0;
    for (let shift = 0; shift < 53 && offset < buffer.length; shift += 7) {
      const byte = buffer[offset++]!;
      result += (byte & 127) * 2 ** shift;
      if (byte < 128) return result;
    }
    throw new Error('Invalid Anki media index.');
  }
  while (offset < buffer.length) {
    const tag = varint();
    const wireType = tag % 8;
    if (wireType === 0) { varint(); continue; }
    const length = wireType === 2 ? varint() : wireType === 1 ? 8 : wireType === 5 ? 4 : -1;
    const end = offset + length;
    if (length < 0 || end > buffer.length) throw new Error('Invalid Anki media index.');
    if (wireType === 2 && Math.floor(tag / 8) === matchField) yield buffer.subarray(offset, end);
    offset = end;
  }
}

function readMediaIndex(bytes: Uint8Array | undefined, modern: boolean): Map<string, string> {
  const index = new Map<string, string>();
  if (!bytes) return index;
  if (modern) {
    let i = 0;
    for (const entry of protobufBytes(zstdDecompressSync(bytes, { maxOutputLength: 32 * MIB }), 1)) {
      const name = protobufBytes(entry, 1).next().value;
      if (name) index.set(Buffer.from(name).toString('utf8').normalize('NFC'), String(i));
      i += 1;
    }
  } else {
    const entries = JSON.parse(Buffer.from(bytes).toString('utf8')) as Record<string, unknown>;
    for (const [id, name] of Object.entries(entries)) {
      if (/^\d+$/.test(id) && typeof name === 'string') index.set(name.normalize('NFC'), id);
    }
  }
  return index;
}

function mapSchedule(card: AnkiCardRow, collectionStart: number, now: Date): ImportedSchedule | undefined {
  if (card.type < 1 || card.type > 3 || card.reps < 1) return undefined;
  const dueValue = card.odid && card.odue ? card.odue : card.due;
  const due = dueValue > 1_000_000_000 ? new Date(dueValue * 1000) : new Date(collectionStart * 1000);
  if (dueValue <= 1_000_000_000) due.setDate(due.getDate() + dueValue);
  if (!Number.isFinite(+due)) throw new Error('The Anki deck contains an invalid due date.');
  const lastReview = card.last_review ?? card.mod * 1000;
  let fsrs: { s?: number; d?: number } = {};
  try { fsrs = JSON.parse(card.data) ?? {}; } catch { /* Older decks have no stored FSRS parameters. */ }
  return {
    state: card.type,
    dueAt: due.toISOString(),
    stability: fsrs.s && fsrs.s > 0 ? fsrs.s : Math.max(0.1, card.ivl || 0.5),
    difficulty: typeof fsrs.d === 'number' && fsrs.d >= 1 && fsrs.d <= 10 ? fsrs.d :
      Math.min(10, Math.max(1, 5 + (2500 - (card.factor || 2500)) / 250)),
    scheduledDays: Math.max(0, card.ivl),
    elapsedDays: Math.max(0, Math.floor((+now - lastReview) / 86_400_000)),
    reps: card.reps,
    lapses: card.lapses,
    learningSteps: 0,
    lastReviewAt: lastReview > 0 && Number.isFinite(+new Date(lastReview)) ? new Date(lastReview).toISOString() : null,
  };
}

export function importAnkiPackage(
  target: DatabaseSync,
  media: LocalMediaStore,
  filePath: string,
  now = new Date(),
): ImportSummary {
  if (fs.statSync(filePath).size > MAX_PACKAGE) throw new Error('Anki packages over 1 GB must be exported in smaller decks.');
  const archive = fs.readFileSync(filePath);
  const members = unzipSync(archive, { filter: ({ name, originalSize }) => {
    if (!/^collection\.anki(2|21|21b)$|^media$/.test(name)) return false;
    if (originalSize > 256 * MIB) throw new Error('The Anki collection is too large. Export a smaller deck.');
    return true;
  } });
  const modern = Boolean(members['collection.anki21b']);
  const bytes = members['collection.anki21b'] ?? members['collection.anki21'] ?? members['collection.anki2'];
  if (!bytes) throw new Error('This file does not contain an Anki deck.');
  const mediaIndex = readMediaIndex(members.media, modern);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'korean-reader-anki-'));
  let source: DatabaseSync | undefined;
  try {
    const collectionPath = path.join(tmp, 'collection.sqlite');
    fs.writeFileSync(collectionPath, modern ? zstdDecompressSync(bytes, { maxOutputLength: 256 * MIB }) : bytes);
    const db = source = new DatabaseSync(collectionPath, { readOnly: true });
    db.exec('PRAGMA trusted_schema = OFF');
    const collection = db.prepare('SELECT * FROM col LIMIT 1').get() as { crt: number; models?: string; decks?: string } | undefined;
    if (!collection) throw new Error('Anki deck collection is empty.');
    const fieldsByModel = new Map<number, NoteField[]>();
    const deckNames = new Map<number, string>();
    if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'fields'").get()) {
      for (const field of db.prepare('SELECT ntid, name, ord FROM fields').iterate() as Iterable<{ ntid: number } & NoteField>) {
        const fields = fieldsByModel.get(field.ntid) ?? [];
        fields.push(field);
        fieldsByModel.set(field.ntid, fields);
      }
      for (const deck of db.prepare('SELECT id, name FROM decks').iterate() as Iterable<{ id: number; name: string }>) {
        deckNames.set(deck.id, deck.name.replace(/\x1f/g, '::'));
      }
    } else {
      const models = JSON.parse(collection.models ?? '{}') as Record<string, { flds: NoteField[] }>;
      for (const [id, model] of Object.entries(models)) fieldsByModel.set(Number(id), model.flds);
      const decks = JSON.parse(collection.decks ?? '{}') as Record<string, { name: string }>;
      for (const [id, deck] of Object.entries(decks)) deckNames.set(Number(id), deck.name);
    }

    // Pick one primary card per headword. Prefer a graduated card over another template's new card.
    const primaryCards = new Map<number, AnkiCardRow>();
    const cardRows = db.prepare(`SELECT cards.*, rev.last_review FROM cards LEFT JOIN
      (SELECT cid, MAX(id) AS last_review FROM revlog WHERE ease BETWEEN 1 AND 4 GROUP BY cid) rev
      ON rev.cid = cards.id ORDER BY CASE type WHEN 2 THEN 0 WHEN 3 THEN 1 WHEN 1 THEN 2 ELSE 3 END,
      ivl DESC, reps DESC, cards.id`).iterate() as unknown as Iterable<AnkiCardRow>;
    for (const card of cardRows) if (!primaryCards.has(card.nid)) primaryCards.set(card.nid, card);
    const entries: Array<PackageEntry | null> = [];
    const needed = new Set<string>();
    for (const note of db.prepare('SELECT id, mid, flds FROM notes ORDER BY id').iterate() as Iterable<{ id: number; mid: number; flds: string }>) {
      const values = note.flds.split('\x1f');
      const fields = Object.fromEntries((fieldsByModel.get(note.mid) ?? []).map(({ name, ord }) => [name, { value: values[ord] }]));
      const headword = stripHtml(findFieldValue(fields, ['Focus Word', 'Word', 'Expression', 'Vocabulary', 'Korean', 'Front'])
        .replace(/\[sound:[^\]]*\]/gi, '')).split('\n')[0]?.trim().normalize('NFC') ?? '';
      if (!/\p{Script=Hangul}/u.test(headword)) { entries.push(null); continue; }
      const rawSentence = findFieldValue(fields, ['Sentence', 'Example', 'Context', 'Expression']);
      const sentence = stripHtml(rawSentence).split('\n').map((line) => line.trim()).filter(Boolean).join('\n');
      const definitions = stripHtml(findFieldValue(fields, ['Definition', 'Meaning', 'Glossary', 'English', 'Back']))
        .split('\n').map((line) => line.trim()).filter(Boolean);
      const pronunciation = stripHtml(findFieldValue(fields, ['Pronunciation', 'Reading'])) || undefined;
      const image = extractImageFilename(fields);
      const audio = extractAudioFilename(fields);
      for (const filename of [image, audio]) {
        const index = filename && mediaIndex.get(filename.normalize('NFC'));
        if (index) needed.add(index);
      }
      const card = primaryCards.get(note.id);
      const deck = deckNames.get(card?.odid || card?.did || 0) || path.basename(filePath, '.apkg');
      const minedAt = note.id > 1_000_000_000_000 && note.id <= +now ? new Date(note.id).toISOString() : now.toISOString();
      entries.push({ headword, pronunciation, definitions, ankiNoteId: note.id,
        schedule: card ? mapSchedule(card, collection.crt, now) : undefined,
        context: { originalForm: extractHighlightedForm(rawSentence) ?? headword, sentence: sentence || headword,
          sourceUrl: '', sourceTitle: `Anki: ${deck}`, minedAt }, image, audio });
    }

    let zipMediaBytes = 0;
    const attachments = needed.size ? unzipSync(archive, { filter: ({ name, originalSize }) => {
      if (!needed.has(name) || originalSize > MAX_MEDIA) return false;
      zipMediaBytes += originalSize;
      if (zipMediaBytes > MAX_PACKAGE) throw new Error('Anki media exceeds 1 GB. Export a smaller deck.');
      return true;
    } }) : {};
    let missingMedia = 0;
    function dataUrl(filename: string | null, kind: 'audio' | 'image'): string | undefined {
      if (!filename) return undefined;
      const id = mediaIndex.get(filename.normalize('NFC'));
      const raw = id === undefined ? undefined : attachments[id];
      const mime = EXT_TO_MIME[path.extname(filename).slice(1).toLowerCase()];
      if (mime?.startsWith(`${kind}/`) && raw?.length) {
        try {
          const data = modern ? zstdDecompressSync(raw, { maxOutputLength: MAX_MEDIA }) : Buffer.from(raw);
          if (data.length) return `data:${mime};base64,${data.toString('base64')}`;
        } catch { /* Import the text if an attachment cannot be decoded. */ }
      }
      missingMedia += 1;
    }
    function* converted() {
      for (const entry of entries) {
        if (!entry) { yield null; continue; }
        const { context, image, audio, ...card } = entry;
        yield { ...card, createdAt: context.minedAt, contexts: [{ ...context, image: dataUrl(image, 'image'), audio: dataUrl(audio, 'audio') }] };
      }
    }
    const summary = importVocabularyEntries(target, media, converted(), now);
    return { ...summary, missingMedia };
  } finally {
    source?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
