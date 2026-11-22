export interface KnownWordPoint {
  at: number;
  count: number;
}

export interface KnownWordHistory {
  baseline: KnownWordPoint;
  days: KnownWordPoint[];
}

export interface AnkiDeckStatistics {
  deckName: string;
  reviewsToday: number;
  reviewsNextWeek: number;
  knownWords: number;
  totalWords: number;
  history: { totalReviews: number; reviewMilliseconds: number } | null;
}

export type HistoryResponse =
  | { ok: true; history: KnownWordHistory | null }
  | { ok: false; error: string };
