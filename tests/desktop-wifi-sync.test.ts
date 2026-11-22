import { EventEmitter } from 'node:events';
import http from 'node:http';
import { Readable } from 'node:stream';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDesktopDatabase } from '../desktop/src/main/db';
import { importVocabularyJson } from '../desktop/src/main/importer';
import { exchangeKnownWordChanges, getKnownWordsCode, mergeKnownWords, readKnownWords } from '../desktop/src/main/known-words';
import { deleteCard } from '../desktop/src/main/library';
import { LocalMediaStore } from '../desktop/src/main/media';
import { submitReview, undoLastReview } from '../desktop/src/main/review';
import { createManifest, mergeManifest, readManifest } from '../desktop/src/main/sync-library';
import { hostWifiSync, joinWifiSync } from '../desktop/src/main/wifi-sync';
import { createSampleMinedEntry } from '../desktop/src/shared/fixtures';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.restoreAllMocks();
});

function makeDevice() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'korean-reader-sync-'));
  const database = openDesktopDatabase(':memory:');
  const media = new LocalMediaStore(dir);
  cleanups.push(() => { database.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { db: database.db, media, confirm: async () => true };
}

function add(device: ReturnType<typeof makeDevice>, definition: string, withMedia = false) {
  const sample = createSampleMinedEntry();
  const entry = { ...sample, definitions: [definition], contexts: sample.contexts.map((context) =>
    ({ ...context, sentence: definition, audio: withMedia ? context.audio : undefined, image: undefined })) };
  importVocabularyJson(device.db, device.media, JSON.stringify([entry]));
  return String(device.db.prepare('SELECT id FROM cards').get()?.id);
}

function exchange(left: ReturnType<typeof makeDevice>, right: ReturnType<typeof makeDevice>) {
  const first = readManifest(JSON.parse(JSON.stringify(createManifest(left.db))));
  const second = readManifest(JSON.parse(JSON.stringify(createManifest(right.db))));
  mergeManifest(left.db, second);
  mergeManifest(right.db, first);
}

describe('Wi-Fi library sync', () => {
  it('unions independently mined cards and chooses the latest review schedule in both directions', () => {
    const left = makeDevice();
    const right = makeDevice();
    const leftCard = add(left, 'first definition');
    const rightCard = add(right, 'second definition');
    const earlier = submitReview(left.db, leftCard, 3, new Date('2026-11-11T01:00:00Z'));
    const later = submitReview(right.db, rightCard, 4, new Date('2026-11-12T01:00:00Z'));
    expect(earlier.ok && later.ok).toBe(true);

    exchange(left, right);
    exchange(left, right);
    for (const device of [left, right]) {
      expect(device.db.prepare('SELECT definitions_json FROM cards').all()).toEqual([
        { definitions_json: '["first definition","second definition"]' },
      ]);
      expect(device.db.prepare('SELECT COUNT(*) AS count FROM contexts').get()?.count).toBe(2);
      expect(device.db.prepare('SELECT COUNT(*) AS count FROM review_logs').get()?.count).toBe(2);
      expect(device.db.prepare('SELECT due_at FROM schedules').get()?.due_at).toBe(later.nextDueAt);
    }

    expect(undoLastReview(left.db).ok).toBe(true);
    exchange(left, right);
    for (const device of [left, right]) {
      expect(device.db.prepare('SELECT due_at FROM schedules').get()?.due_at).toBe(earlier.nextDueAt);
      expect(device.db.prepare('SELECT COUNT(*) AS count FROM review_logs').get()?.count).toBe(1);
    }

    expect(deleteCard(left.db, leftCard)).toBe(true);
    exchange(left, right);
    exchange(left, right);
    for (const device of [left, right]) {
      expect(device.db.prepare('SELECT COUNT(*) AS count FROM cards').get()?.count).toBe(0);
      expect(device.db.prepare('SELECT COUNT(*) AS count FROM study_review_history').get()?.count).toBe(1);
    }
  });

  it('merges Known words without creating study cards and honors unmarks', () => {
    const left = makeDevice();
    const right = makeDevice();
    const code = getKnownWordsCode(left.db);
    expect(() => exchangeKnownWordChanges(left.db, { code: 'wrong', changes: [] })).toThrow('Invalid Known words code');
    exchangeKnownWordChanges(left.db, { code, changes: [{ headword: '학교', known: true, revision: 0 }] });
    mergeKnownWords(right.db, [{ headword: '책', known: true, revision: 0 }]);
    exchange(left, right);
    expect(readKnownWords(left.db)).toEqual(readKnownWords(right.db));
    expect(readKnownWords(right.db)).toHaveLength(2);
    mergeKnownWords(right.db, [{ headword: '학교', known: false, revision: 5 }]);
    exchange(left, right);
    expect(readKnownWords(left.db)).toContainEqual({ headword: '학교', known: false, revision: 5 });
    expect(left.db.prepare('SELECT COUNT(*) AS count FROM cards').get()?.count).toBe(0);
  });

  it('rolls back a library merge when referenced media is missing', () => {
    const left = makeDevice();
    const right = makeDevice();
    add(left, 'audio card', true);
    expect(() => exchange(left, right)).toThrow('required media file is missing');
    expect(right.db.prepare('SELECT COUNT(*) AS count FROM cards').get()?.count).toBe(0);
  });

  it('exchanges encrypted packets, transfers only missing media, and retries an interrupted transfer', async () => {
    let handle: http.RequestListener;
    let dropCommit = true;
    const routes: string[] = [];
    vi.spyOn(http, 'createServer').mockImplementation(((_options: unknown, listener: http.RequestListener) => {
      handle = listener;
      const emitter = new EventEmitter();
      return Object.assign(emitter, {
        listen(_port: number, _host: string, ready: () => void) { ready(); },
        close() { emitter.emit('close'); },
        closeAllConnections() {},
        address() { return { port: 1234 }; },
      });
    }) as typeof http.createServer);
    vi.spyOn(http, 'request').mockImplementation(((options: http.RequestOptions, receive: (res: http.IncomingMessage) => void) => {
      const request = new EventEmitter();
      return Object.assign(request, {
        setTimeout() {},
        end(bytes: Buffer) {
          const route = String(options.path);
          routes.push(route);
          const headers = Object.fromEntries(Object.entries(options.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
          const input = Object.assign(Readable.from([bytes]), { url: route, method: 'POST', headers });
          let statusCode = 200;
          const result = {
            writeHead(status: number) { statusCode = status; return result; },
            end(body?: Buffer, done?: () => void) {
              receive(Object.assign(Readable.from(body ? [body] : []), { statusCode }) as http.IncomingMessage);
              done?.();
            },
          };
          queueMicrotask(() => {
            if (route === '/commit' && dropCommit) {
              dropCommit = false;
              request.emit('error', new Error('Connection dropped'));
            } else {
              handle(input as unknown as http.IncomingMessage, result as unknown as http.ServerResponse);
            }
          });
        },
      });
    }) as unknown as typeof http.request);

    const left = makeDevice();
    const right = makeDevice();
    add(left, 'with audio', true);
    const rightCard = add(right, 'other device');
    const image = right.media.saveDataUrl(right.db,
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR2sAAAAASUVORK5CYII=');
    right.db.prepare('UPDATE contexts SET image_asset_id = ? WHERE card_id = ?').run(image!.id, rightCard);
    const host = await hostWifiSync({ ...left, onComplete() {} }, '127.0.0.1');
    cleanups.push(host.close);
    const badCode = host.invite.replace(/:[A-Za-z0-9_-]{43}$/, ':' + 'A'.repeat(43));
    await expect(joinWifiSync(right, badCode)).rejects.toThrow();
    await expect(joinWifiSync(right, host.invite)).rejects.toThrow('Connection dropped');
    expect(right.db.prepare('SELECT COUNT(*) AS count FROM contexts').get()?.count).toBe(1);
    host.close();

    const retry = await hostWifiSync({ ...left, onComplete() {} }, '127.0.0.1');
    cleanups.push(retry.close);
    await joinWifiSync(right, retry.invite);
    expect(routes.filter((route) => route === '/download')).toHaveLength(1);
    expect(routes.filter((route) => route === '/upload')).toHaveLength(1);
    expect(left.db.prepare('SELECT COUNT(*) AS count FROM contexts').get()?.count).toBe(2);
    expect(right.db.prepare('SELECT COUNT(*) AS count FROM contexts').get()?.count).toBe(2);
  });

  it('transfers authenticated manifests and media across a real socket when loopback is available', async (ctx) => {
    const left = makeDevice();
    const right = makeDevice();
    add(left, 'with audio', true);
    add(right, 'other device');
    let host: Awaited<ReturnType<typeof hostWifiSync>>;
    try {
      host = await hostWifiSync({ ...left, onComplete() {} }, '127.0.0.1');
    } catch (error) {
      if (['EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        ctx.skip('Sandbox blocks loopback sockets');
        return;
      }
      throw error;
    }
    cleanups.push(host.close);
    const badCode = host.invite.replace(/:[A-Za-z0-9_-]{43}$/, ':' + 'A'.repeat(43));
    await expect(joinWifiSync(right, badCode)).rejects.toThrow();
    await joinWifiSync(right, host.invite);
    expect(right.db.prepare('SELECT COUNT(*) AS count FROM media_assets').get()?.count).toBe(1);
    expect(left.db.prepare('SELECT COUNT(*) AS count FROM contexts').get()?.count).toBe(2);
    expect(right.db.prepare('SELECT COUNT(*) AS count FROM contexts').get()?.count).toBe(2);
  });
});
