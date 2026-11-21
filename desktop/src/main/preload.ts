import { contextBridge, ipcRenderer } from 'electron';
import {
  DESKTOP_IPC_CHANNELS,
  type DesktopApi,
  type DesktopReviewSettings,
  type ImportSummary,
  type ReviewRatingValue,
} from '../shared/api';

const desktopApi: DesktopApi = {
  getStudyStats: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.getStudyStats),
  startPractice: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.startPractice),
  answerPractice: (id, choice) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.answerPractice, id, choice),
  getSampleEntry: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.getSampleEntry),
  getRuntimeInfo: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.getRuntimeInfo),
  openExternalUrl: (url: string) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.openExternalUrl, url),
  importVocabularyFile: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.importVocabularyFile),
  listCards: (query?: string) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.listCards, query),
  getCardDetail: (cardId: string) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.getCardDetail, cardId),
  getLibraryStats: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.getLibraryStats),
  deleteCard: (cardId: string) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.deleteCard, cardId),
  importAnkiPackage: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.importAnkiPackage),
  getReviewQueue: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.getReviewQueue),
  getNextReviewCard: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.getNextReviewCard),
  submitReview: (cardId: string, rating: ReviewRatingValue, durationMs?: number) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.submitReview, cardId, rating, durationMs),
  undoLastReview: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.undoLastReview),
  getReviewSettings: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.getReviewSettings),
  saveReviewSettings: (settings: Partial<DesktopReviewSettings>) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.saveReviewSettings, settings),
  onLibraryUpdated: (callback: (summary: ImportSummary) => void) => {
    const listener = (_event: unknown, summary: ImportSummary) => callback(summary);
    ipcRenderer.on(DESKTOP_IPC_CHANNELS.libraryUpdated, listener);
    return () => {
      ipcRenderer.removeListener(DESKTOP_IPC_CHANNELS.libraryUpdated, listener);
    };
  },

};

contextBridge.exposeInMainWorld('koreanReaderDesktop', desktopApi);
