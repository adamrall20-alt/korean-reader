export const DEFAULT_USERNAME = 'Reader';
export const MAX_USERNAME_LENGTH = 32;

const vocabularyRanks = [
  { minimum: 0, name: '새싹', translation: 'Sprout' },
  { minimum: 250, name: '새내기 독자', translation: 'New Reader' },
  { minimum: 1_000, name: '이야기 탐험가', translation: 'Story Explorer' },
  { minimum: 3_000, name: '문장 수집가', translation: 'Sentence Collector' },
  { minimum: 7_000, name: '독서가', translation: 'Reader' },
  { minimum: 12_000, name: '다독가', translation: 'Avid Reader' },
  { minimum: 20_000, name: '책벌레', translation: 'Bookworm' },
  { minimum: 30_000, name: '어휘 달인', translation: 'Vocabulary Master' },
] as const;

export function reviewProgress(totalReviews: number) {
  let level = 1;
  let earned = totalReviews;
  let required = 25;
  while (earned >= required) {
    earned -= required;
    level += 1;
    required += 5;
  }
  return { level, earned, required };
}

export function vocabularyProgress(knownWords: number | null) {
  if (knownWords === null) return null;
  const nextIndex = vocabularyRanks.findIndex((rank) => knownWords < rank.minimum);
  const currentIndex = nextIndex === -1 ? vocabularyRanks.length - 1 : nextIndex - 1;
  return { rank: vocabularyRanks[currentIndex]!, next: vocabularyRanks[nextIndex] };
}
