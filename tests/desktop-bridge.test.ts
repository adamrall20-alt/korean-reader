import fs from 'node:fs';
import os from 'node:os';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDesktopDatabase } from '../desktop/src/main/db';
import { createBridgeHandler } from '../desktop/src/main/bridge';
import { listCards } from '../desktop/src/main/library';
import { getStudyStats } from '../desktop/src/main/stats';
import { LocalMediaStore } from '../desktop/src/main/media';
import { createSampleMinedEntry } from '../desktop/src/shared/fixtures';
import { pushEntriesToDesktop, pushKnownHistory, syncMissingEntriesToDesktop } from '../services/desktop/bridge';
import type { VocabularyEntry } from '../types/vocabulary';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'korean-reader-bridge-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('Extension-to-Desktop auto-import bridge', () => {
  it('auto-imports newly mined words and syncs only missing mined entries', async () => {
    const dir = createTempDir();
    const desktopDb = openDesktopDatabase(path.join(dir, 'test.sqlite'));
    const media = new LocalMediaStore(path.join(dir, 'media'));
    const onImport = vi.fn();

    const handler = createBridgeHandler({ db: desktopDb.db, mediaStore: media, onImport });
    const baseUrl = 'http://127.0.0.1:17421';
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const request = Object.assign(Readable.from(init?.body ? [Buffer.from(String(init.body))] : []), {
        url: new URL(url).pathname, method: init?.method ?? 'GET', headers: { origin: new Headers(init?.headers).get('Origin') ?? undefined },
      });
      let status = 200;
      let body = '';
      await handler(request as unknown as IncomingMessage, {
        writeHead(code: number) { status = code; },
        end(value: string) { body = value; },
      } as unknown as ServerResponse);
      return new Response(body, { status });
    });
    try {
      // 1. Push a newly mined word
      const sample = createSampleMinedEntry();
      const pushed = await pushEntriesToDesktop([sample], baseUrl);
      expect(pushed).toBe(true);
      expect(onImport).toHaveBeenCalledTimes(1);
      expect(listCards(desktopDb.db)).toHaveLength(1);

      // 2. Sync missing entries: sample (already present), missingWord (new mined), knownOnly (no contexts)
      const missingWord: VocabularyEntry = {
        ...sample,
        headword: '경험',
        originalForm: '경험을',
        definitions: ['experience'],
        contexts: [
          {
            ...sample.contexts[0]!,
            sentence: '좋은 경험을 했어요.',
            originalForm: '경험을',
            audio: undefined,
          },
        ],
      };
      const knownOnly: VocabularyEntry = {
        ...sample,
        headword: '학교',
        originalForm: '학교',
        contexts: [],
      };

      const syncResult = await syncMissingEntriesToDesktop(
        [sample, missingWord, knownOnly],
        baseUrl,
      );
      expect(syncResult).toEqual({ synced: 1, reachable: true });
      expect(listCards(desktopDb.db).map((c) => c.headword).sort()).toEqual(
        [sample.headword, '경험'].sort(),
      );

      // 3. Rejects arbitrary web origins
      const forbidden = await fetch(`${baseUrl}/headwords`, {
        headers: { Origin: 'https://evil.example' },
      });
      expect(forbidden.status).toBe(403);
      await pushKnownHistory({ baseline: { at: Date.now(), count: 2100 }, days: [] }, baseUrl);
      expect(getStudyStats(desktopDb.db).knownWords).toBe(2100);
      expect(listCards(desktopDb.db)).toHaveLength(2);
    } finally {
      vi.unstubAllGlobals();
      desktopDb.close();
    }
  });

  it('fails gracefully when the Desktop app is not running', async () => {
    const sample = createSampleMinedEntry();
    const unreachableUrl = 'http://127.0.0.1:1';

    expect(await pushEntriesToDesktop([sample], unreachableUrl)).toBe(false);
    expect(await syncMissingEntriesToDesktop([sample], unreachableUrl)).toEqual({
      synced: 0,
      reachable: false,
    });
  });
});
