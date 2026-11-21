import { createEmptyCard, fsrs, Rating, State, type Grade } from 'ts-fsrs';
import type { FsrsPreviewRating } from './api';

const STATE_LABELS: Record<State, string> = {
  [State.New]: 'New',
  [State.Learning]: 'Learning',
  [State.Review]: 'Review',
  [State.Relearning]: 'Relearning',
};

const RATINGS: Array<{ key: FsrsPreviewRating['rating']; value: Grade }> = [
  { key: 'Again', value: Rating.Again },
  { key: 'Hard', value: Rating.Hard },
  { key: 'Good', value: Rating.Good },
  { key: 'Easy', value: Rating.Easy },
];

/**
 * Verifies that ts-fsrs runs cleanly in the desktop runtime and produces
 * deterministic initial scheduling intervals for a new card.
 */
export function runFsrsSpike(now: Date = new Date()): FsrsPreviewRating[] {
  const scheduler = fsrs();
  const card = createEmptyCard(now);
  const outcomes = scheduler.repeat(card, now);

  return RATINGS.map(({ key, value }) => {
    const result = outcomes[value];
    return {
      rating: key,
      dueIso: result.card.due.toISOString(),
      scheduledDays: result.card.scheduled_days,
      state: STATE_LABELS[result.card.state] ?? String(result.card.state),
    };
  });
}
