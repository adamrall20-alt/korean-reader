import { AnkiClient } from './client';
import { deckSearch, previewKnownWords } from './import';
import type { AnkiSettings } from '@/types/anki';
import type { AnkiDeckStatistics } from '@/types/statistics';

export async function readDeckStatistics(settings: AnkiSettings): Promise<AnkiDeckStatistics | null> {
  const { deckName } = settings;
  if (!deckName) return null;

  const client = new AnkiClient(settings);
  const decks = await client.request('deckNamesAndIds', undefined);
  const deckId = decks[deckName];
  if (!Number.isSafeInteger(deckId)) throw new Error('Choose an available Anki deck in Settings.');

  const [stats, upcoming, words] = await Promise.all([
    client.request('getDeckStats', { decks: [deckName] }),
    client.request('findCards', {
      query: `${deckSearch(deckName)} is:review -is:suspended -is:learn prop:due>=1 prop:due<=7`,
    }),
    previewKnownWords(settings, deckName),
  ]);
  const selected = stats?.[String(deckId)];
  if (!selected || !Number.isInteger(selected.review_count) || selected.review_count < 0) {
    throw new Error('AnkiConnect did not return the review count for the selected deck.');
  }

  return {
    deckName,
    reviewsToday: selected.review_count,
    reviewsNextWeek: upcoming.length,
    knownWords: words.alreadyKnown,
    totalWords: words.total,
  };
}
