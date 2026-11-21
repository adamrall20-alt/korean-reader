import { contextBridge, ipcRenderer } from 'electron';
import { DESKTOP_IPC_CHANNELS, type DesktopApi, type ImportSummary } from '../shared/api';

const desktopApi: DesktopApi = {
  getSampleEntry: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.getSampleEntry),
  getRuntimeInfo: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.getRuntimeInfo),
  openExternalUrl: (url: string) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.openExternalUrl, url),
  importVocabularyFile: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.importVocabularyFile),
  listCards: (query?: string) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.listCards, query),
  getCardDetail: (cardId: string) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.getCardDetail, cardId),
  getLibraryStats: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.getLibraryStats),
  deleteCard: (cardId: string) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.deleteCard, cardId),
  onLibraryUpdated: (callback: (summary: ImportSummary) => void) => {
    const listener = (_event: unknown, summary: ImportSummary) => callback(summary);
    ipcRenderer.on(DESKTOP_IPC_CHANNELS.libraryUpdated, listener);
    return () => {
      ipcRenderer.removeListener(DESKTOP_IPC_CHANNELS.libraryUpdated, listener);
    };
  },
};

contextBridge.exposeInMainWorld('koreanReaderDesktop', desktopApi);
