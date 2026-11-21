import path from 'node:path';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import {
  DESKTOP_IPC_CHANNELS,
  isSafeExternalUrl,
  type DesktopRuntimeInfo,
  type OpenExternalResult,
} from '../shared/api';
import { createSampleMinedEntry } from '../shared/fixtures';
import { runFsrsSpike } from '../shared/fsrs-spike';

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
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 920,
    height: 700,
    minWidth: 640,
    minHeight: 520,
    title: 'Korean Reader Desktop (Phase D0)',
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

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
