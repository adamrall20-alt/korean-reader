import { contextBridge, ipcRenderer } from 'electron';
import { DESKTOP_IPC_CHANNELS, type DesktopApi } from '../shared/api';

const desktopApi: DesktopApi = {
  getSampleEntry: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.getSampleEntry),
  getRuntimeInfo: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.getRuntimeInfo),
  openExternalUrl: (url: string) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.openExternalUrl, url),
};

contextBridge.exposeInMainWorld('koreanReaderDesktop', desktopApi);
