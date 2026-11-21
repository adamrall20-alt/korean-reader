import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import {
  DESKTOP_IPC_CHANNELS,
  isSafeExternalUrl,
  type DeleteCardResult,
  type DesktopRuntimeInfo,
  type ImportResult,
  type OpenExternalResult,
} from '../shared/api';
import { createSampleMinedEntry } from '../shared/fixtures';
import { runFsrsSpike } from '../shared/fsrs-spike';
import { openDesktopDatabase, type DesktopDatabase } from './db';
import { startDesktopBridge, type DesktopBridgeServer } from './bridge';
import { importVocabularyJson } from './importer';
import { deleteCard, getCardDetail, getLibraryStats, listCards } from './library';
import { LocalMediaStore } from './media';

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
