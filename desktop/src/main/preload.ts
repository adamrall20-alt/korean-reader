import { contextBridge, ipcRenderer } from 'electron';
import { DESKTOP_IPC_CHANNELS, type DesktopApi } from '../shared/api';

const desktopApi: DesktopApi = {
  getSampleEntry: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.getSampleEntry),
  getRuntimeInfo: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.getRuntimeInfo),
  openExternalUrl: (url: string) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.openExternalUrl, url),
  importVocabularyFile: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.importVocabularyFile),
  listCards: (query?: string) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.listCards, query),
  getCardDetail: (cardId: string) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.getCardDetail, cardId),
  getLibraryStats: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.getLibraryStats),
  deleteCard: (cardId: string) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.deleteCard, cardId),
};

contextBridge.exposeInMainWorld('koreanReaderDesktop', desktopApi);
