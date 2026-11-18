import { AnkiClient } from '@/services/anki/client';
import { plainText } from '@/services/anki/fields';
import { listVocabulary } from '@/services/storage/vocabulary';
import { ANKI_DEFAULT_FIELDS, type AnkiImportPreview, type AnkiSettings } from '@/types/anki';

export function deckSearch(deckName: string): string {
  const escapedDeck = deckName.replace(/[\\"*_]/g, '\\$&');
  return `"deck:${escapedDeck}"`;
}

export async function previewKnownWords(settings: AnkiSettings, deckName: string): Promise<AnkiImportPreview> {
  const client = new AnkiClient(settings);
  const ids = await client.request('findNotes', { query: deckSearch(deckName) });
  const words = new Set<string>();
  let skipped = 0;
  for (let offset = 0; offset < ids.length; offset += 250) {
    const notes = await client.request('notesInfo', { notes: ids.slice(offset, offset + 250) });
    for (const note of notes) {
      const focus = note.fields[ANKI_DEFAULT_FIELDS.word] ??
        (note.modelName === settings.modelName ? note.fields[settings.fields.word] : undefined);
      const word = plainText((focus?.value ?? '').replace(/\[sound:[^\]]*\]/gi, ''));
      if (/\p{Script=Hangul}/u.test(word)) words.add(word);
      else skipped += 1;
    }
  }

  if (!words.size) return { headwords: [], alreadyKnown: 0, skipped, total: 0 };
  const entries = await listVocabulary();
  const known = new Set(entries.filter((entry) => entry.status === 'known').map((entry) => entry.headword));
  const headwords = [...words].filter((word) => !known.has(word));
  return { headwords, alreadyKnown: words.size - headwords.length, skipped, total: words.size };
}
