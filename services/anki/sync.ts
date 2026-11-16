import { AnkiClient, type AnkiNote, type AnkiNoteInfo } from '@/services/anki/client';
import { getVocabulary, recordAnkiSync } from '@/services/storage/vocabulary';
import { ANKI_DEFAULT_FIELDS, ANKI_FIELD_ROLES, type AnkiSettings, type AnkiSyncResult } from '@/types/anki';
import type { VocabularyEntry } from '@/types/vocabulary';

function headwordTag(headword: string): string {
  return 'kr-word-' + Array.from(headword, (character) => character.codePointAt(0)!.toString(16)).join('-');
}

const NOTE_TAG = 'korean-reader';
const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (character) => entities[character]!);
}

function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|nbsp|#39|apos);/gi, (entity) =>
      ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&nbsp;': ' ', '&#39;': "'", '&apos;': "'" })[entity.toLowerCase()] ?? entity)
    .normalize('NFC').trim();
}

function escapeSearch(text: string): string {
  return text.replace(/[\\"*_:]/g, '\\$&');
}

function sentenceFields(entry: VocabularyEntry): Map<string, string> {
  const sentences = new Map<string, string>();
  for (const context of entry.contexts) {
    const focusForms = [...new Set([context.originalForm || entry.originalForm, entry.headword])]
      .filter(Boolean).sort((a, b) => b.length - a.length);
    const matches = focusForms.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const sentence = context.sentence.trim().normalize('NFC');
    const parts = sentence.split(new RegExp(`(${matches.join('|')})`, 'gu'));
    sentences.set(sentence, parts.map((part, index) => index % 2
      ? `<span style="color: #f59e0b">${escapeHtml(part)}</span>`
      : escapeHtml(part).replace(/\r?\n/g, '<br>'),
    ).join(''));
  }
  return sentences;
}

function buildNote(entry: VocabularyEntry, settings: AnkiSettings): AnkiNote {
  const { deckName, modelName, fields } = settings;
  const values = {
    word: escapeHtml(entry.headword),
    sentence: [...sentenceFields(entry).values()].join('<br>'),
    definition: (entry.definitions.length ? entry.definitions
      : entry.machineDefinitions?.length ? entry.machineDefinitions : entry.koreanDefinitions)
      .map(escapeHtml).join('<br>'),
    pronunciation: escapeHtml(entry.pronunciation ?? ''),
    image: '',
    audio: '',
  };
  const mapped = ANKI_FIELD_ROLES.flatMap((role) => fields[role] ? [[fields[role], values[role]]] : []);
  return { deckName, modelName, fields: Object.fromEntries(mapped), tags: [NOTE_TAG, headwordTag(entry.headword)], options: { allowDuplicate: false } };
}

async function findExisting(
  client: AnkiClient,
  entry: VocabularyEntry,
  settings: AnkiSettings,
): Promise<AnkiNoteInfo | undefined> {
  const focusFields = [...new Set([settings.fields.word, ANKI_DEFAULT_FIELDS.word, entry.ankiFocusField].filter(Boolean))];
  const searches = focusFields.map((field) => `"${escapeSearch(field!)}:${escapeSearch(entry.headword)}"`);
  searches.push(`tag:${headwordTag(entry.headword)}`);
  if (entry.ankiNoteId) searches.push(`nid:${entry.ankiNoteId}`);
  const ids = await client.request('findNotes', { query: searches.join(' OR ') });
  if (!ids.length) return undefined;

  const notes = await client.request('notesInfo', { notes: ids });
  const matches = notes.filter((note) => focusFields.some((field) =>
    plainText(note.fields[field!]?.value ?? '') === entry.headword,
  ));
  if (!matches.length && notes.some((note) => note.tags?.includes(headwordTag(entry.headword)))) {
    throw new Error('A previously synced note exists. Check its focus word and field mapping in Anki.');
  }
  if (matches.length > 1) throw new Error('Multiple existing Anki notes have this headword. Resolve the duplicates in Anki.');
  return matches[0];
}

async function appendSentences(
  client: AnkiClient,
  existing: AnkiNoteInfo,
  entry: VocabularyEntry,
  settings: AnkiSettings,
): Promise<boolean> {
  const field = settings.fields.sentence;
  if (existing.modelName !== settings.modelName || !existing.fields[field]) {
    throw new Error(`This word already exists in the “${existing.modelName}” note type. Select its note type and sentence field to update it.`);
  }

  const current = existing.fields[field].value;
  const asText = plainText(current.replace(/<(?:br\b[^>]*|\/div|\/p)>/gi, '\n'));
  const lines = asText.split(/\r?\n/).map((line) => line.trim());
  const added = [...sentenceFields(entry)].filter(([sentence]) =>
    !`\n${lines.join('\n')}\n`.includes(`\n${sentence.split(/\r?\n/).map((line) => line.trim()).join('\n')}\n`),
  );
  if (!added.length) return false;

  const merged = [current, ...added.map(([, html]) => html)].filter(Boolean).join('<br>');
  await client.request('updateNoteFields', { note: { id: existing.noteId, fields: { [field]: merged } } });
  const [updated] = await client.request('notesInfo', { notes: [existing.noteId] });
  if (updated?.fields[field]?.value !== merged) {
    throw new Error('Anki did not save the sentence update. Close the note in Anki’s browser and retry.');
  }
  return true;
}

export async function validateAnkiSettings(client: AnkiClient, settings: AnkiSettings): Promise<void> {
  const [decks, models] = await Promise.all([
    client.request('deckNames', undefined), client.request('modelNames', undefined),
  ]);
  if (!decks.includes(settings.deckName)) throw new Error('Choose an available Anki deck.');
  if (!models.includes(settings.modelName)) throw new Error('Choose an available Anki note type.');

  const fields = await client.request('modelFieldNames', { modelName: settings.modelName });
  if (!settings.fields.word || !settings.fields.sentence || !settings.fields.definition) {
    throw new Error('Map the focus word, sentence and definition fields.');
  }
  const mapped = Object.values(settings.fields).filter(Boolean);
  if (new Set(mapped).size !== mapped.length || mapped.some((field) => !fields.includes(field))) {
    throw new Error('Map each role to a different field from the selected note type.');
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Anki sync failed.';
}

async function saveResult(headword: string, status: 'created' | 'updated' | 'existing', id: number, focusField: string): Promise<AnkiSyncResult> {
  try {
    await recordAnkiSync(headword, id, focusField);
    return { headword, status };
  } catch {
    return { headword, status, message: 'Anki succeeded, but the local sync marker could not be saved.' };
  }
}

let syncing = false;

export async function syncVocabulary(settings: AnkiSettings, headwords: string[]): Promise<AnkiSyncResult[]> {
  if (syncing) throw new Error('Anki sync is already running.');
  syncing = true;
  try {
    const client = new AnkiClient(settings);
    await validateAnkiSettings(client, settings);
    const results: AnkiSyncResult[] = [];
    const candidates: Array<{ headword: string; note: AnkiNote }> = [];
    for (const headword of new Set(headwords.map((word) => word.trim().normalize('NFC')))) {
      try {
        const entry = await getVocabulary(headword);
        if (!entry) throw new Error('This word is no longer in your vocabulary.');
        const existing = await findExisting(client, entry, settings);
        if (existing) {
          const updated = await appendSentences(client, existing, entry, settings);
          results.push(await saveResult(headword, updated ? 'updated' : 'existing', existing.noteId, settings.fields.word));
        } else {
          candidates.push({ headword, note: buildNote(entry, settings) });
        }
      } catch (error) {
        results.push({ headword, status: 'failed', message: errorMessage(error) });
      }
    }

    if (candidates.length) {
      let eligible = candidates;
      try {
        const allowed = await client.request('canAddNotes', { notes: candidates.map(({ note }) => note) });
        eligible = candidates.filter(({ headword }, index) => {
          if (allowed[index]) return true;
          results.push({ headword, status: 'failed', message: 'Anki rejected the note. Check for duplicates or missing required fields.' });
          return false;
        });

        const ids = eligible.length === 1
          ? [await client.request('addNote', { note: eligible[0]!.note })]
          : eligible.length ? await client.request('addNotes', { notes: eligible.map(({ note }) => note) }) : [];
        for (const [index, candidate] of eligible.entries()) {
          const id = ids[index];
          results.push(typeof id === 'number' && id > 0
            ? await saveResult(candidate.headword, 'created', id, settings.fields.word)
            : { headword: candidate.headword, status: 'failed', message: 'Anki did not return a note ID. Retry to check the collection.' });
        }
      } catch (error) {
        results.push(...eligible.map(({ headword }): AnkiSyncResult =>
          ({ headword, status: 'failed', message: errorMessage(error) })));
      }
    }
    return results;
  } finally {
    syncing = false;
  }
}
