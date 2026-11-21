import { createPracticeSession } from './practice';
import { getStudyStats, saveKnownWordHistory } from './stats';
import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import {
  DESKTOP_IPC_CHANNELS,
  isSafeExternalUrl,
  type DeleteCardResult,
  type DesktopReviewSettings,
  type DesktopRuntimeInfo,
  type ImportResult,
  type OpenExternalResult,
  type ReviewRatingValue,
  type SubmitReviewResult,
} from '../shared/api';
import { createSampleMinedEntry } from '../shared/fixtures';
import { runFsrsSpike } from '../shared/fsrs-spike';
import { importAnkiPackage } from './anki-import';
import { openDesktopDatabase, type DesktopDatabase } from './db';
import { startDesktopBridge, type DesktopBridgeServer } from './bridge';
import { importVocabularyJson } from './importer';
import { deleteCard, getCardDetail, getLibraryStats, listCards } from './library';
import { LocalMediaStore } from './media';
import {
  getNextReviewCard,
  getReviewQueueSummary,
  submitReview,
  undoLastReview,
} from './review';
import { getReviewSettings, saveReviewSettings } from './settings';

let database: DesktopDatabase | null = null;
let mediaStore: LocalMediaStore | null = null;
let bridgeServer: DesktopBridgeServer | null = null;

function ensureStorage(): { db: DesktopDatabase; media: LocalMediaStore } {
  if (!database || !mediaStore) {
    const userData = app.getPath('userData');
    database = openDesktopDatabase(path.join(userData, 'korean-reader.sqlite'));
    mediaStore = new LocalMediaStore(path.join(userData, 'media'));
  }
  return { db: database, media: mediaStore };
}

async function checkSqliteAvailable(): Promise<boolean> {
  try {
    const sqlite = await import('node:sqlite');
    const db = new sqlite.DatabaseSync(':memory:');
    db.exec('CREATE TABLE ping (id INTEGER PRIMARY KEY); INSERT INTO ping (id) VALUES (1);');
    const row = db.prepare('SELECT id FROM ping WHERE id = 1').get() as { id?: number } | undefined;
    db.close();
    return row?.id === 1;
  } catch {
    return false;
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(DESKTOP_IPC_CHANNELS.getSampleEntry, () => createSampleMinedEntry());

  ipcMain.handle(DESKTOP_IPC_CHANNELS.getRuntimeInfo, async (): Promise<DesktopRuntimeInfo> => {
    const sqliteAvailable = await checkSqliteAvailable();
    let fsrsPreview: DesktopRuntimeInfo['fsrsPreview'] = [];
    let fsrsVerified = false;
    try {
      fsrsPreview = runFsrsSpike();
      fsrsVerified = fsrsPreview.length === 4;
    } catch {
      fsrsVerified = false;
    }

    return {
      electron: process.versions.electron ?? 'unknown',
      chrome: process.versions.chrome ?? 'unknown',
      node: process.versions.node ?? 'unknown',
      platform: process.platform,
      arch: process.arch,
      sqliteAvailable,
      fsrsVerified,
      fsrsPreview,
    };
  });

  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.openExternalUrl,
    async (_event, rawUrl: unknown): Promise<OpenExternalResult> => {
      if (typeof rawUrl !== 'string' || !isSafeExternalUrl(rawUrl)) {
        return { ok: false, error: 'Only http:// and https:// URLs can be opened.' };
      }
      await shell.openExternal(rawUrl);
      return { ok: true };
    },
  );

  ipcMain.handle(DESKTOP_IPC_CHANNELS.importVocabularyFile, async (): Promise<ImportResult> => {
    const result = await dialog.showOpenDialog({
      title: 'Import Korean Reader Vocabulary JSON',
      properties: ['openFile'],
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, cancelled: true };
    }

    const filePath = result.filePaths[0]!;
    try {
      const rawJson = fs.readFileSync(filePath, 'utf8');
      const { db, media } = ensureStorage();
      const summary = importVocabularyJson(db.db, media, rawJson);
      return {
        ok: true,
        fileName: path.basename(filePath),
        summary,
      };
    } catch (error) {
      return {
        ok: false,
        fileName: path.basename(filePath),
        error: error instanceof Error ? error.message : 'Failed to import vocabulary file.',
      };
    }
  });

  ipcMain.handle(DESKTOP_IPC_CHANNELS.listCards, (_event, query: unknown) => {
    const { db } = ensureStorage();
    return listCards(db.db, typeof query === 'string' ? query : undefined);
  });

  ipcMain.handle(DESKTOP_IPC_CHANNELS.getCardDetail, (_event, cardId: unknown) => {
    if (typeof cardId !== 'string' || !cardId) return null;
    const { db, media } = ensureStorage();
    return getCardDetail(db.db, media, cardId);
  });

  ipcMain.handle(DESKTOP_IPC_CHANNELS.getLibraryStats, () => {
    const { db } = ensureStorage();
    return getLibraryStats(db.db);
  });

  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.deleteCard,
    (_event, cardId: unknown): DeleteCardResult => {
      if (typeof cardId !== 'string' || !cardId) {
        return { ok: false, error: 'Invalid card ID.' };
      }
      const { db } = ensureStorage();
      const deleted = deleteCard(db.db, cardId);
      return deleted ? { ok: true } : { ok: false, error: 'Card not found.' };
    },
  );

  ipcMain.handle(DESKTOP_IPC_CHANNELS.importAnkiPackage, async (): Promise<ImportResult> => {
    const result = await dialog.showOpenDialog({
      title: 'Import Anki deck package',
      properties: ['openFile'],
      filters: [{ name: 'Anki deck package', extensions: ['apkg'] }],
    });
    const filePath = result.filePaths[0];
    if (result.canceled || !filePath) return { ok: false, cancelled: true };
    try {
      const { db, media } = ensureStorage();
      const summary = importAnkiPackage(db.db, media, filePath);
      return { ok: true, fileName: path.basename(filePath), summary };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Anki package import failed.' };
    }
  });

  ipcMain.handle(DESKTOP_IPC_CHANNELS.getReviewQueue, () => {
    const { db } = ensureStorage();
    return getReviewQueueSummary(db.db);
  });

  let practiceSession: ReturnType<typeof createPracticeSession> | undefined;
  ipcMain.handle(DESKTOP_IPC_CHANNELS.startPractice, () => {
    const { db, media } = ensureStorage();
    practiceSession = createPracticeSession(db.db, media);
    return practiceSession.questions;
  });
  ipcMain.handle(DESKTOP_IPC_CHANNELS.answerPractice, (_event, id: unknown, choice: unknown) => {
    if (!practiceSession) throw new Error('Start a practice session first.');
    return practiceSession.answer(id, choice);
  });
  ipcMain.handle(DESKTOP_IPC_CHANNELS.importKnownHistory, async () => {
    const selected = await dialog.showOpenDialog({
      title: 'Import known-word history',
      properties: ['openFile'],
      filters: [{ name: 'Known-word history', extensions: ['json'] }],
    });
    const filename = selected.filePaths[0];
    if (selected.canceled || !filename) return { ok: false, cancelled: true };
    try {
      if (fs.statSync(filename).size > 2 * 1024 * 1024) throw new Error('The history file is too large.');
      saveKnownWordHistory(ensureStorage().db.db, JSON.parse(fs.readFileSync(filename, 'utf8')));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not import known-word history.' };
    }
  });
  ipcMain.handle(DESKTOP_IPC_CHANNELS.getStudyStats, () => getStudyStats(ensureStorage().db.db));

  ipcMain.handle(DESKTOP_IPC_CHANNELS.getNextReviewCard, () => {
    const { db, media } = ensureStorage();
    return getNextReviewCard(db.db, media);
  });

  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.submitReview,
    (_event, cardId: unknown, rating: unknown, durationMs: unknown): SubmitReviewResult => {
      if (typeof cardId !== 'string' || !cardId) {
        return { ok: false, error: 'Invalid card ID.' };
      }
      if (rating !== 1 && rating !== 2 && rating !== 3 && rating !== 4) {
        return { ok: false, error: 'Invalid rating.' };
      }
      const { db } = ensureStorage();
      return submitReview(db.db, cardId, rating as ReviewRatingValue, new Date(),
        typeof durationMs === 'number' ? durationMs : undefined);
    },
  );

  ipcMain.handle(DESKTOP_IPC_CHANNELS.undoLastReview, () => {
    const { db } = ensureStorage();
    return undoLastReview(db.db);
  });

  ipcMain.handle(DESKTOP_IPC_CHANNELS.getReviewSettings, () => {
    const { db } = ensureStorage();
    return getReviewSettings(db.db);
  });

  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.saveReviewSettings,
    (_event, patch: unknown) => {
      const { db } = ensureStorage();
      const safePatch: Partial<DesktopReviewSettings> =
        patch && typeof patch === 'object' ? (patch as Partial<DesktopReviewSettings>) : {};
      return saveReviewSettings(db.db, safePatch);
    },
  );
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    title: 'Korean Reader',
    backgroundColor: '#111111',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const rendererHtml = path.join(__dirname, '../renderer/index.html');
  void win.loadFile(rendererHtml);
  return win;
}

app.whenReady().then(async () => {
  const { db, media } = ensureStorage();
  try {
    bridgeServer = await startDesktopBridge({
      db: db.db,
      mediaStore: media,
      onKnownHistory() {
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send(DESKTOP_IPC_CHANNELS.knownHistoryUpdated);
        }
      },
      onImport(summary) {
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send(DESKTOP_IPC_CHANNELS.libraryUpdated, summary);
        }
      },
    });
  } catch (error) {
    console.warn('[Korean Reader Desktop] Extension auto-import bridge unavailable:', error);
  }

  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  void bridgeServer?.close();
  bridgeServer = null;
  database?.close();
  database = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
