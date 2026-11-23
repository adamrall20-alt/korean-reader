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
  reviewsToday: number | null;
  reviewsNextWeek: number | null;
  coverage: { knownWords: number; totalWords: number } | null;
  history: { totalReviews: number; reviewMilliseconds: number } | null;
}

export type HistoryResponse =
  | { ok: true; history: KnownWordHistory | null }
  | { ok: false; error: string };
