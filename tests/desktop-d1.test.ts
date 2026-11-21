import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { openDesktopDatabase, runMigrations } from '../desktop/src/main/db';
import { importVocabularyJson } from '../desktop/src/main/importer';
import { deleteCard, getCardDetail, getLibraryStats, listCards } from '../desktop/src/main/library';
import { decodeBase64DataUrl, LocalMediaStore } from '../desktop/src/main/media';
import { createSampleMinedEntry, createSampleWavDataUrl } from '../desktop/src/shared/fixtures';
import type { DesktopApi } from '../desktop/src/shared/api';
import App from '../desktop/src/renderer/App.vue';

const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'korean-reader-d1-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  delete window.koreanReaderDesktop;
  delete document.documentElement.dataset.theme;
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Phase D1 local database, media store, and JSON importer', () => {
  it('runs SQLite migrations idempotently', () => {
    const desktopDb = openDesktopDatabase(':memory:');
    try {
      runMigrations(desktopDb.db);
      const versions = desktopDb.db
        .prepare('SELECT version FROM schema_migrations')
        .all() as Array<{ version: number }>;
      expect(versions.map((v) => v.version)).toEqual([1, 2, 3, 4, 5]);
    } finally {
      desktopDb.close();
    }
  });

  it('deduplicates media assets by SHA-256 and blocks path traversal', () => {
    const dir = createTempDir();
    const desktopDb = openDesktopDatabase(path.join(dir, 'test.sqlite'));
    const media = new LocalMediaStore(path.join(dir, 'media'));
    try {
      expect(decodeBase64DataUrl('not-a-data-url')).toBeNull();
      expect(media.resolveSafePath('../escape.png')).toBeNull();
      expect(media.resolveSafePath('/etc/passwd')).toBeNull();

      const first = media.saveDataUrl(desktopDb.db, ONE_PIXEL_PNG);
      const second = media.saveDataUrl(desktopDb.db, ONE_PIXEL_PNG);

      expect(first?.created).toBe(true);
      expect(second?.created).toBe(false);
      expect(second?.id).toBe(first?.id);

      const roundTrip = media.readAsDataUrl(desktopDb.db, first?.id);
      expect(roundTrip).toBe(ONE_PIXEL_PNG);
    } finally {
      desktopDb.close();
    }
  });

  it('imports mined vocabulary, skips known-only words, deduplicates re-imports, and fills missing media', () => {
    const dir = createTempDir();
    const desktopDb = openDesktopDatabase(path.join(dir, 'test.sqlite'));
    const media = new LocalMediaStore(path.join(dir, 'media'));

    try {
      const sample = createSampleMinedEntry();
      const withoutAudio = {
        ...sample,
        headword: sample.headword.normalize('NFD'),
        contexts: [
          {
            ...sample.contexts[0]!,
            audio: undefined,
            image: ONE_PIXEL_PNG,
          },
        ],
      };
      const knownOnly = {
        headword: '학생',
        originalForm: '학생',
        definitions: ['student'],
        koreanDefinitions: [],
        contexts: [],
        status: 'known',
        createdAt: '2026-11-21T00:00:00.000Z',
        updatedAt: '2026-11-21T00:00:00.000Z',
      };

      const firstImport = importVocabularyJson(
        desktopDb.db,
        media,
        JSON.stringify([withoutAudio, knownOnly, { bad: true }]),
      );

      expect(firstImport.cardsAdded).toBe(1);
      expect(firstImport.contextsAdded).toBe(1);
      expect(firstImport.skippedKnownOnly).toBe(1);
      expect(firstImport.skippedInvalid).toBe(1);
      expect(firstImport.mediaSaved).toBe(1);
      expect(firstImport.totalCards).toBe(1);

      const cards = listCards(desktopDb.db);
      expect(cards).toHaveLength(1);
      expect(cards[0]!.headword).toBe(sample.headword.normalize('NFC'));

      // Re-import with audio added on the same context
      const withAudio = {
        ...sample,
        contexts: [
          {
            ...sample.contexts[0]!,
            audio: createSampleWavDataUrl(),
            image: ONE_PIXEL_PNG,
          },
        ],
      };

      const secondImport = importVocabularyJson(desktopDb.db, media, JSON.stringify([withAudio]));
      expect(secondImport.cardsAdded).toBe(0);
      expect(secondImport.cardsUpdated).toBe(1);
      expect(secondImport.contextsAdded).toBe(0);
      expect(secondImport.contextsUpdated).toBe(1);
      expect(secondImport.mediaSaved).toBe(1);

      const detail = getCardDetail(desktopDb.db, media, cards[0]!.id);
      expect(detail?.contexts).toHaveLength(1);
      expect(detail?.contexts[0]?.imageDataUrl).toBe(ONE_PIXEL_PNG);
      expect(detail?.contexts[0]?.audioDataUrl).toMatch(/^data:audio\/wav;base64,/);

      const stats = getLibraryStats(desktopDb.db);
      expect(stats.totalCards).toBe(1);
      expect(stats.totalContexts).toBe(1);
      expect(stats.newCards).toBe(1);
      expect(stats.mediaAssets).toBe(2);

      expect(listCards(desktopDb.db, sample.headword.slice(0, 2))).toHaveLength(1);
      expect(listCards(desktopDb.db, '없는단어')).toHaveLength(0);

      expect(deleteCard(desktopDb.db, cards[0]!.id)).toBe(true);
      expect(listCards(desktopDb.db)).toHaveLength(0);
    } finally {
      desktopDb.close();
    }
  });

  it('rejects malformed or non-array JSON files', () => {
    const dir = createTempDir();
    const desktopDb = openDesktopDatabase(path.join(dir, 'test.sqlite'));
    const media = new LocalMediaStore(path.join(dir, 'media'));
    try {
      expect(() => importVocabularyJson(desktopDb.db, media, '{not json')).toThrow('not valid JSON');
      expect(() => importVocabularyJson(desktopDb.db, media, '{"a":1}')).toThrow('JSON array');
    } finally {
      desktopDb.close();
    }
  });

  it('renders imported cards in App.vue, plays audio, and opens external source links', async () => {
    const sample = createSampleMinedEntry();
    const openExternalUrl = vi.fn().mockResolvedValue({ ok: true });
    const mockApi: DesktopApi = {
      getStudyStats: vi.fn(),
      startPractice: vi.fn(),
      answerPractice: vi.fn(),
      importAnkiPackage: vi.fn(),
      getSampleEntry: vi.fn().mockResolvedValue(sample),
      getRuntimeInfo: vi.fn().mockResolvedValue({
        electron: '45.4.1',
        chrome: '138.0.0.0',
        node: '24.14.0',
        platform: 'darwin',
        arch: 'arm64',
        sqliteAvailable: true,
        fsrsVerified: true,
        fsrsPreview: [],
      }),
      openExternalUrl,
      importVocabularyFile: vi.fn().mockResolvedValue({
        ok: true,
        fileName: 'korean-reader-vocabulary.json',
        summary: {
          cardsAdded: 1,
          cardsUpdated: 0,
          contextsAdded: 1,
          contextsUpdated: 0,
          skippedKnownOnly: 5,
          skippedInvalid: 0,
          mediaSaved: 1,
          totalCards: 1,
        },
      }),
      listCards: vi.fn().mockResolvedValue([
        {
          id: 'card-1',
          headword: sample.headword,
          pronunciation: sample.pronunciation,
          partOfSpeech: sample.partOfSpeech,
          frequencyRank: sample.frequencyRank,
          definitions: sample.definitions,
          koreanDefinitions: sample.koreanDefinitions,
          contextCount: 1,
          primarySentence: sample.contexts[0]!.sentence,
          scheduleState: 0,
          dueAt: '2026-11-21T00:00:00.000Z',
          createdAt: '2026-11-21T00:00:00.000Z',
          updatedAt: '2026-11-21T00:00:00.000Z',
        },
      ]),
      getCardDetail: vi.fn().mockResolvedValue({
        id: 'card-1',
        headword: sample.headword,
        pronunciation: sample.pronunciation,
        partOfSpeech: sample.partOfSpeech,
        frequencyRank: sample.frequencyRank,
        definitions: sample.definitions,
        koreanDefinitions: sample.koreanDefinitions,
        scheduleState: 0,
        dueAt: '2026-11-21T00:00:00.000Z',
        reps: 0,
        lapses: 0,
        createdAt: '2026-11-21T00:00:00.000Z',
        updatedAt: '2026-11-21T00:00:00.000Z',
        contexts: [
          {
            id: 'ctx-1',
            sentence: sample.contexts[0]!.sentence,
            originalForm: sample.contexts[0]!.originalForm,
            sourceUrl: sample.contexts[0]!.sourceUrl,
            sourceTitle: sample.contexts[0]!.sourceTitle,
            timestamp: sample.contexts[0]!.timestamp,
            hasImage: false,
            hasAudio: true,
            minedAt: sample.contexts[0]!.minedAt,
            audioDataUrl: sample.contexts[0]!.audio,
          },
        ],
      }),
      getLibraryStats: vi.fn().mockResolvedValue({
        totalCards: 1,
        totalContexts: 1,
        newCards: 1,
        dueCards: 1,
        mediaAssets: 1,
      }),
      deleteCard: vi.fn().mockResolvedValue({ ok: true }),
    };

    window.koreanReaderDesktop = mockApi;
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.text()).toContain(sample.headword);
    expect(wrapper.find('mark').text()).toBe(sample.contexts[0]!.originalForm);

    const playBtn = wrapper.findAll('button').find((b) => b.text().includes('Play Audio'));
    expect(playBtn).toBeDefined();
    await playBtn!.trigger('click');
    expect(playSpy).toHaveBeenCalledTimes(1);

    const sourceBtn = wrapper.findAll('button').find((b) => b.text().includes('Open Source'));
    expect(sourceBtn).toBeDefined();
    await sourceBtn!.trigger('click');
    expect(openExternalUrl).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=KTIByn_rIWM&t=84s',
    );
  });
});
