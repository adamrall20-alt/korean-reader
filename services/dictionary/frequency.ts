import { browser } from 'wxt/browser';

let ranksPromise: Promise<Map<string, number>> | undefined;

export async function frequencyRank(headword: string): Promise<number> {
  ranksPromise ??= fetch(browser.runtime.getURL('/frequency/ko-frequency.tsv')).then(async (response) => {
    if (!response.ok) throw new Error('Frequency list unavailable');
    const ranks = new Map<string, number>();
    for (const line of (await response.text()).split('\n').slice(1)) {
      const [rank, word] = line.split('\t');
      if (word && rank && Number.isInteger(Number(rank))) ranks.set(word.normalize('NFC'), Number(rank));
    }
    if (ranks.size !== 80000) throw new Error('Invalid frequency list');
    return ranks;
  }).catch((error: unknown) => { ranksPromise = undefined; throw error; });
  return (await ranksPromise).get(headword.trim().normalize('NFC')) ?? 80001;
}
