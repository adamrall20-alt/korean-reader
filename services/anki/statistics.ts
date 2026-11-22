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

  const selectedDecks = Object.keys(decks).filter((name) => name === deckName || name.startsWith(deckName + '::'));
  const [stats, upcoming, words, history] = await Promise.all([
    client.request('getDeckStats', { decks: [deckName] }),
    client.request('findCards', {
      query: `${deckSearch(deckName)} is:review -is:suspended -is:learn prop:due>=1 prop:due<=7`,
    }),
    previewKnownWords(settings, deckName),
    readReviewHistory(client, selectedDecks).catch(() => null),
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
    history,
  };
}


async function readReviewHistory(client: AnkiClient, decks: string[]) {
  let totalReviews = 0;
  let reviewMilliseconds = 0;
  for (const deck of decks) {
    const reviews = await client.request('cardReviews', { deck, startID: 0 });
    if (!Array.isArray(reviews)) throw new Error('AnkiConnect returned invalid review history.');
    for (const review of reviews) {
      if (!Array.isArray(review) || !Number.isInteger(review[3]) || !Number.isFinite(review[7]) || review[7] < 0) {
        throw new Error('AnkiConnect returned an invalid review.');
      }
      // Anki records rescheduling and manual edits with no answer button.
      if (review[3] < 1 || review[3] > 4) continue;
      totalReviews += 1;
      reviewMilliseconds += review[7];
    }
  }
  return { totalReviews, reviewMilliseconds };
}
