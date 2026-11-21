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

export interface DesktopContextSummary {
  id: string;
  sentence: string;
  originalForm: string;
  sourceUrl: string;
  sourceTitle: string;
  timestamp?: number;
  hasImage: boolean;
  hasAudio: boolean;
  minedAt: string;
}

export interface DesktopContextDetail extends DesktopContextSummary {
  imageDataUrl?: string;
  audioDataUrl?: string;
}

export interface DesktopCardSummary {
  id: string;
  headword: string;
  pronunciation?: string;
  partOfSpeech?: string;
  frequencyRank?: number;
  definitions: string[];
  koreanDefinitions: string[];
  contextCount: number;
  primarySentence: string;
  scheduleState: number;
  dueAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DesktopCardDetail {
  id: string;
  headword: string;
  pronunciation?: string;
  partOfSpeech?: string;
  frequencyRank?: number;
  definitions: string[];
  koreanDefinitions: string[];
  preferredContextId?: string;
  ankiNoteId?: number;
  scheduleState: number;
  dueAt: string;
  reps: number;
  lapses: number;
  createdAt: string;
  updatedAt: string;
  contexts: DesktopContextDetail[];
}

export interface DesktopLibraryStats {
  totalCards: number;
  totalContexts: number;
  newCards: number;
  dueCards: number;
  mediaAssets: number;
}

export interface ImportSummary {
  cardsAdded: number;
  cardsUpdated: number;
  contextsAdded: number;
  contextsUpdated: number;
  skippedKnownOnly: number;
  skippedInvalid: number;
  mediaSaved: number;
  totalCards: number;
}

export interface ImportResult {
  ok: boolean;
  cancelled?: boolean;
  fileName?: string;
  summary?: ImportSummary;
  error?: string;
}

export interface DeleteCardResult {
  ok: boolean;
  error?: string;
}

export interface AnkiDecksResult {
  ok: boolean;
  decks?: string[];
  error?: string;
}

export interface AnkiImportProgress {
  phase: 'fetching' | 'importing';
  processed: number;
  total: number;
}

export type ReviewRatingValue = 1 | 2 | 3 | 4;

export interface DesktopReviewSettings {
  dailyNewLimit: number;
  dailyReviewLimit: number;
}

export interface ReviewQueueSummary {
  newAvailable: number;
  dueLearning: number;
  dueReviews: number;
  totalDue: number;
  reviewedToday: number;
  dailyNewLimit: number;
  dailyReviewLimit: number;
  dailyLimitReached: boolean;
  canUndo: boolean;
}

export interface ReviewRatingPreview {
  rating: ReviewRatingValue;
  label: 'Again' | 'Hard' | 'Good' | 'Easy';
  intervalText: string;
  dueAt: string;
  scheduledDays: number;
  state: number;
}

export interface NextReviewCardResult {
  card: DesktopCardDetail | null;
  ratingPreviews: ReviewRatingPreview[];
  queue: ReviewQueueSummary;
}

export interface SubmitReviewResult {
  ok: boolean;
  reviewLogId?: string;
  nextDueAt?: string;
  error?: string;
}

export interface UndoReviewResult {
  ok: boolean;
  restoredCardId?: string;
  error?: string;
}

export interface DesktopApi {
  getSampleEntry(): Promise<VocabularyEntry>;
  getRuntimeInfo(): Promise<DesktopRuntimeInfo>;
  openExternalUrl(url: string): Promise<OpenExternalResult>;
  importVocabularyFile(): Promise<ImportResult>;
  listCards(query?: string): Promise<DesktopCardSummary[]>;
  getCardDetail(cardId: string): Promise<DesktopCardDetail | null>;
  getLibraryStats(): Promise<DesktopLibraryStats>;
  deleteCard(cardId: string): Promise<DeleteCardResult>;
  listAnkiDecks?(): Promise<AnkiDecksResult>;
  importAnkiDeck?(deckName: string): Promise<ImportResult>;
  getReviewQueue?(): Promise<ReviewQueueSummary>;
  getNextReviewCard?(): Promise<NextReviewCardResult>;
  submitReview?(cardId: string, rating: ReviewRatingValue): Promise<SubmitReviewResult>;
  undoLastReview?(): Promise<UndoReviewResult>;
  getReviewSettings?(): Promise<DesktopReviewSettings>;
  saveReviewSettings?(settings: Partial<DesktopReviewSettings>): Promise<DesktopReviewSettings>;
  onLibraryUpdated?(callback: (summary: ImportSummary) => void): () => void;
  onAnkiImportProgress?(callback: (progress: AnkiImportProgress) => void): () => void;
}

export const DESKTOP_IPC_CHANNELS = {
  getSampleEntry: 'desktop:get-sample-entry',
  getRuntimeInfo: 'desktop:get-runtime-info',
  openExternalUrl: 'desktop:open-external-url',
  importVocabularyFile: 'desktop:import-vocabulary-file',
  listCards: 'desktop:list-cards',
  getCardDetail: 'desktop:get-card-detail',
  getLibraryStats: 'desktop:get-library-stats',
  deleteCard: 'desktop:delete-card',
  listAnkiDecks: 'desktop:list-anki-decks',
  importAnkiDeck: 'desktop:import-anki-deck',
  getReviewQueue: 'desktop:get-review-queue',
  getNextReviewCard: 'desktop:get-next-review-card',
  submitReview: 'desktop:submit-review',
  undoLastReview: 'desktop:undo-last-review',
  getReviewSettings: 'desktop:get-review-settings',
  saveReviewSettings: 'desktop:save-review-settings',
  libraryUpdated: 'desktop:library-updated',
  ankiImportProgress: 'desktop:anki-import-progress',
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
