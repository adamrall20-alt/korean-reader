// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { zstdCompressSync } from 'node:zlib';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { importAnkiPackage } from '../desktop/src/main/anki-import';
import { openDesktopDatabase } from '../desktop/src/main/db';
import { importVocabularyEntries } from '../desktop/src/main/importer';
import { createPracticeSession } from '../desktop/src/main/practice';
import { getCardDetail, listCards } from '../desktop/src/main/library';
import { LocalMediaStore } from '../desktop/src/main/media';
import { submitReview } from '../desktop/src/main/review';
import { createSampleWavDataUrl } from '../desktop/src/shared/fixtures';

const fields = ['Focus Word', 'Sentence', 'Definition', 'Pronunciation', 'Image', 'Audio'];
const noteId = 1_779_000_000_000;
const reviewTime = 1_779_000_100_000;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const wav = Buffer.from(createSampleWavDataUrl().split(',')[1]!, 'base64');

function createPackage(dir: string, modern: boolean) {
  const colPath = path.join(dir, 'source.sqlite');
  const col = new DatabaseSync(colPath);
  col.exec(`CREATE TABLE col (crt INTEGER, models TEXT, decks TEXT);
    CREATE TABLE notes (id INTEGER, mid INTEGER, flds TEXT);
    CREATE TABLE cards (id INTEGER, nid INTEGER, did INTEGER, odid INTEGER, type INTEGER, due INTEGER, odue INTEGER,
      ivl INTEGER, factor INTEGER, reps INTEGER, lapses INTEGER, mod INTEGER, data TEXT);
    CREATE TABLE revlog (id INTEGER, cid INTEGER, ease INTEGER);
  `);
  const start = new Date(2026, 4, 1, 4);
  col.prepare('INSERT INTO col VALUES (?, ?, ?)').run(+start / 1000,
    JSON.stringify({ 1: { flds: fields.map((name, ord) => ({ name, ord })) } }),
    JSON.stringify({ 1: { name: 'Korean::Mining' } }));
  if (modern) {
    col.exec("CREATE TABLE decks (id INTEGER, name TEXT); INSERT INTO decks VALUES (1, 'Korean' || char(31) || 'Mining'); CREATE TABLE fields (ntid INTEGER, name TEXT, ord INTEGER);");
    fields.forEach((name, ord) => col.prepare('INSERT INTO fields VALUES (1, ?, ?)').run(name, ord));
  }
  const insertNote = col.prepare('INSERT INTO notes VALUES (?, 1, ?)');
  insertNote.run(noteId, ['먹다', '저녁을 <b>먹었어요</b>.<br>그리고 잤어요.', '먹다 = to eat', '먹따', '<img src="photo.png">', '[sound:clip.wav]'].join('\x1f'));
  insertNote.run(noteId + 1, ['학생', '저는 학생.', 'student', '', '<img src="absent.png">', ''].join('\x1f'));
  insertNote.run(noteId + 2, '');
  col.prepare('INSERT INTO cards VALUES (1, ?, 1, 0, 2, 40, 0, 12, 2500, 4, 1, ?, ?)').run(noteId, reviewTime / 1000, '{"s":12.5,"d":4.2}');
  col.prepare('INSERT INTO revlog VALUES (?, 1, 3)').run(reviewTime);
  col.close();

  const db = fs.readFileSync(colPath);
  const archive = path.join(dir, 'sample.apkg');
  const utf8 = (text: string) => Buffer.from(text, 'utf8');
  const mediaEntry = (name: string) => Buffer.concat([Buffer.from([10, name.length + 2, 10, name.length]), utf8(name)]);
  const zip: Record<string, Uint8Array> = modern ? {
    'collection.anki21b': zstdCompressSync(db),
    'collection.anki2': utf8('legacy placeholder'),
    media: zstdCompressSync(Buffer.concat([mediaEntry('clip.wav'), mediaEntry('photo.png')])),
    '0': zstdCompressSync(wav), '1': zstdCompressSync(png),
  } : {
    'collection.anki21': db,
    'collection.anki2': utf8('legacy placeholder'),
    media: utf8(JSON.stringify({ 0: 'clip.wav', 1: 'photo.png' })), '0': wav, '1': png,
  };
  fs.writeFileSync(archive, zipSync(zip));
  const due = new Date(start);
  due.setDate(due.getDate() + 40);
  return { archive, due };
}

describe('Offline Anki deck packages', () => {
  it.each([false, true])('imports scheduling and media from a package with modern format = %s', (modern) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-test-apkg-'));
    const { db, close } = openDesktopDatabase(':memory:');
    try {
      const media = new LocalMediaStore(path.join(dir, 'media'));
      const { archive, due } = createPackage(dir, modern);
      const now = new Date(2026, 5, 12);
      const result = importAnkiPackage(db, media, archive, now);
      expect(result).toMatchObject({ cardsAdded: 2, contextsAdded: 2, mediaSaved: 2, skippedInvalid: 1, missingMedia: 1 });
      const [summary] = listCards(db, '먹다');
      const card = getCardDetail(db, media, summary!.id)!;
      expect(card).toMatchObject({ scheduleState: 2, reps: 4, dueAt: due.toISOString(), ankiNoteId: noteId });
      expect(card.contexts[0]).toMatchObject({ originalForm: '먹었어요', sentence: '저녁을 먹었어요.\n그리고 잤어요.', sourceTitle: 'Anki: Korean::Mining', imageDataUrl: expect.stringMatching(/^data:image\/png;base64,/), audioDataUrl: createSampleWavDataUrl() });
      expect(submitReview(db, card.id, 3, now).ok).toBe(true);
      const updated = getCardDetail(db, media, card.id);
      expect(importAnkiPackage(db, media, archive, now)).toMatchObject({ cardsAdded: 0, contextsAdded: 0, mediaSaved: 0 });
      expect(getCardDetail(db, media, card.id)?.dueAt).toBe(updated?.dueAt);
      importVocabularyEntries(db, media, [
        ['걷다', '걸었어요', 'to walk'], ['읽다', '읽었어요', 'to read'], ['자다', '잤어요', 'to sleep'],
      ].map(([headword, form, definition]) => ({
        headword, definitions: [definition], partOfSpeech: 'verb',
        contexts: [{ originalForm: form, sentence: `어제 ${form}.` }],
      })), now);
      const practice = createPracticeSession(db, media, () => 0.5, now);
      const question = practice.questions.find(({ before }) => before === '저녁을 ');
      expect(question).toBeDefined();
      expect(question?.options).not.toContain('먹다 = to eat');
      const invalid = path.join(dir, 'empty.apkg');
      fs.writeFileSync(invalid, zipSync({ media: Buffer.from('{}') }));
      expect(() => importAnkiPackage(db, media, invalid)).toThrow('does not contain an Anki deck');
    } finally {
      close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
