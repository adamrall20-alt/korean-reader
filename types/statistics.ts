export interface KnownWordPoint {
  at: number;
  count: number;
}

export interface KnownWordHistory {
  baseline: KnownWordPoint;
  days: KnownWordPoint[];
}
