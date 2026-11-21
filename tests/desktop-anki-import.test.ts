import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { importAnkiDeck, listAnkiDecks } from '../desktop/src/main/anki-import';
import { openDesktopDatabase } from '../desktop/src/main/db';
import { getCardDetail, listCards } from '../desktop/src/main/library';
import { LocalMediaStore } from '../desktop/src/main/media';
import { createSampleWavDataUrl } from '../desktop/src/shared/fixtures';

const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const SAMPLE_WAV_BASE64 = createSampleWavDataUrl().replace(/^data:audio\/wav;base64,/, '');

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'korean-reader-anki-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

async function startMockAnkiConnect() {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        action: string;
        params?: Record<string, unknown>;
      };

      let result: unknown = null;
      if (body.action === 'deckNames') {
        result = ['Korean::Mining', 'Default'];
      } else if (body.action === 'findNotes') {
        result = [1001, 1002];
      } else if (body.action === 'notesInfo') {
        result = [
          {
            noteId: 1001,
            modelName: 'Kimchi Sentence Mining',
            fields: {
              'Focus Word': { value: '글러브' },
              Sentence: { value: '<span style="color:#f59e0b">글러브</span> 복싱 글러브 처음 봐?' },
              Definition: { value: '글러브 = glove: A thick leather glove<br>boxing glove' },
              Pronunciation: { value: '글러브' },
              Image: { value: '<img src="frame_1001.png">' },
              Audio: { value: '[sound:clip_1001.wav]' },
            },
          },
          {
            noteId: 1002,
            modelName: 'Kimchi Sentence Mining',
            fields: {
              'Focus Word': { value: '' },
              Sentence: { value: 'empty focus word should be skipped' },
            },
          },
        ];
      } else if (body.action === 'retrieveMediaFile') {
        const filename = body.params?.filename;
        if (filename === 'frame_1001.png') result = ONE_PIXEL_PNG_BASE64;
        else if (filename === 'clip_1001.wav') result = SAMPLE_WAV_BASE64;
        else result = false;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result, error: null }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    endpoint: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

describe('Desktop AnkiConnect deck importer', () => {
  it('lists decks and imports notes with HTML cleanup, screenshots, and audio', async () => {
    const dir = createTempDir();
    const desktopDb = openDesktopDatabase(path.join(dir, 'test.sqlite'));
    const media = new LocalMediaStore(path.join(dir, 'media'));
    const mockAnki = await startMockAnkiConnect();

    try {
      const decks = await listAnkiDecks(mockAnki.endpoint);
      expect(decks).toEqual(['Default', 'Korean::Mining']);

      const progressEvents: number[] = [];
      const summary = await importAnkiDeck({
        db: desktopDb.db,
        mediaStore: media,
        deckName: 'Korean::Mining',
        endpoint: mockAnki.endpoint,
        onProgress(p) {
          progressEvents.push(p.processed);
        },
      });

      expect(summary.cardsAdded).toBe(1);
      expect(summary.contextsAdded).toBe(1);
      expect(summary.skippedInvalid).toBe(1);
      expect(summary.mediaSaved).toBe(2);
      expect(progressEvents.at(-1)).toBe(2);

      const cards = listCards(desktopDb.db);
      expect(cards).toHaveLength(1);
      expect(cards[0]!.headword).toBe('글러브');

      const detail = getCardDetail(desktopDb.db, media, cards[0]!.id);
      expect(detail?.ankiNoteId).toBe(1001);
      expect(detail?.pronunciation).toBe('글러브');
      expect(detail?.definitions).toEqual([
        '글러브 = glove: A thick leather glove',
        'boxing glove',
      ]);
      expect(detail?.contexts[0]?.sentence).toBe('글러브 복싱 글러브 처음 봐?');
      expect(detail?.contexts[0]?.imageDataUrl).toBe(
        `data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`,
      );
      expect(detail?.contexts[0]?.audioDataUrl).toMatch(/^data:audio\/wav;base64,/);
    } finally {
      await mockAnki.close();
      desktopDb.close();
    }
  });

  it('reports a clear error when AnkiConnect is unreachable', async () => {
    await expect(listAnkiDecks('http://127.0.0.1:1')).rejects.toThrow('AnkiConnect');
  });
});
