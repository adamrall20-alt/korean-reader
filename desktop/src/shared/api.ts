import type { VocabularyEntry } from '../../../types/vocabulary';

export interface FsrsPreviewRating {
  rating: 'Again' | 'Hard' | 'Good' | 'Easy';
  dueIso: string;
  scheduledDays: number;
  state: string;
}

export interface DesktopRuntimeInfo {
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  arch: string;
  sqliteAvailable: boolean;
  fsrsVerified: boolean;
  fsrsPreview: FsrsPreviewRating[];
}

export interface OpenExternalResult {
  ok: boolean;
  error?: string;
}

export interface DesktopApi {
  getSampleEntry(): Promise<VocabularyEntry>;
  getRuntimeInfo(): Promise<DesktopRuntimeInfo>;
  openExternalUrl(url: string): Promise<OpenExternalResult>;
}

export const DESKTOP_IPC_CHANNELS = {
  getSampleEntry: 'desktop:get-sample-entry',
  getRuntimeInfo: 'desktop:get-runtime-info',
  openExternalUrl: 'desktop:open-external-url',
} as const;

export function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function buildSourceLink(sourceUrl: string, timestamp?: number): string {
  if (timestamp === undefined || !Number.isFinite(timestamp) || timestamp < 0) {
    return sourceUrl;
  }
  const seconds = Math.floor(timestamp);
  const separator = sourceUrl.includes('?') ? '&' : '?';
  return `${sourceUrl}${separator}t=${seconds}s`;
}
