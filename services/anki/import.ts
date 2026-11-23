import { lookupJapaneseWords } from '@/services/japanese/analysis';
import { normalizeJapanese } from '@/services/japanese/jmdict';
import { hasJapaneseText, type ReaderLanguage } from '@/types/language';
import type { JapaneseKnownWord } from '@/types/vocabulary';
import { isKoreanHeadword } from '@/services/storage/known-words';
import { AnkiClient } from '@/services/anki/client';
import { plainText } from '@/services/anki/fields';
import { listKnownHeadwords } from '@/services/storage/vocabulary';
import { ANKI_DEFAULT_FIELDS, type AnkiImportPreview, type AnkiSettings } from '@/types/anki';

export function deckSearch(deckName: string): string {
  const escapedDeck = deckName.replace(/[\\"*_]/g, '\\$&');
  return `"deck:${escapedDeck}"`;
}

export async function previewKnownWords(settings: AnkiSettings, deckName: string, language: ReaderLanguage = 'ko'): Promise<AnkiImportPreview> {
  const client = new AnkiClient(settings);
  const ids = await client.request('findNotes', { query: deckSearch(deckName) });
  const words = new Set<string>();
  const japanese: JapaneseImportTerm[] = [];
  let skipped = 0;
  for (let offset = 0; offset < ids.length; offset += 250) {
    const notes = await client.request('notesInfo', { notes: ids.slice(offset, offset + 250) });
    for (const note of notes) {
      const mapped = note.modelName === settings.modelName ? note.fields[settings.fields.word] : undefined;
      const focus = mapped ?? note.fields[ANKI_DEFAULT_FIELDS.word] ?? note.fields.FocusWord;
      const word = plainText((focus?.value ?? '').replace(/\[sound:[^\]]*\]/gi, ''));
      if (language === 'ja' && hasJapaneseText(word) && word.length <= 100) {
        const reading = plainText(note.fields[settings.fields.pronunciation]?.value ?? note.fields.Reading?.value ?? note.fields.Pronunciation?.value ?? '');
        japanese.push({ word, reading });
      } else if (language === 'ko' && isKoreanHeadword(word)) words.add(word);
      else skipped += 1;
    }
  }

  if (language === 'ja') return previewJapaneseTerms(japanese, skipped);
  if (!words.size) return { headwords: [], alreadyKnown: 0, skipped, total: 0 };
  const known = new Set(await listKnownHeadwords());
  const headwords = [...words].filter((word) => !known.has(word));
  return { headwords, alreadyKnown: words.size - headwords.length, skipped, total: words.size };
}

export interface JapaneseImportTerm { word: string; reading?: string }

export async function previewJapaneseTerms(terms: JapaneseImportTerm[], skipped = 0): Promise<AnkiImportPreview> {
  const words = new Map<string, JapaneseKnownWord>();
  const unique = [...new Map(terms.map((term) =>
    [normalizeJapanese(term.word) + ':' + normalizeJapanese(term.reading ?? ''), term])).values()];
  for (let offset = 0; offset < unique.length; offset += 50) {
    const batch = unique.slice(offset, offset + 50);
    const results = await lookupJapaneseWords(batch.map(({ word }) => word));
    results.forEach((entries, index) => {
      const reading = normalizeJapanese((batch[index]?.reading ?? '').replace(/^\[(.*)\]$/u, '$1'));
      const matches = reading ? entries.filter((entry) => normalizeJapanese(entry.japanese?.reading ?? '') === reading) : entries;
      const match = matches.length === 1 ? matches[0] : undefined;
      if (match?.japanese) words.set(match.japanese.id, { headword: match.headword, japanese: match.japanese });
      else skipped += 1;
    });
  }
  const known = words.size ? new Set(await listKnownHeadwords('ja')) : new Set<string>();
  const japaneseWords = [...words.values()].filter(({ japanese }) => !known.has(japanese.id));
  return { japaneseWords, headwords: japaneseWords.map(({ headword }) => headword), total: words.size,
    alreadyKnown: words.size - japaneseWords.length, skipped };
}
