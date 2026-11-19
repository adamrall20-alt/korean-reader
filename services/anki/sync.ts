import { AnkiClient, type AnkiNote, type AnkiNoteInfo } from '@/services/anki/client';
import { plainText } from '@/services/anki/fields';
import { getVocabulary, listVocabulary, recordAnkiSync } from '@/services/storage/vocabulary';
import { ANKI_DEFAULT_FIELDS, ANKI_FIELD_ROLES, type AnkiSettings, type AnkiSyncResult } from '@/types/anki';
import { isSubtitleAudio, SUBTITLE_AUDIO_PREFIX } from '@/types/audio';
import type { VocabularyEntry } from '@/types/vocabulary';

function headwordTag(headword: string): string {
  return 'kr-word-' + Array.from(headword, (character) => character.codePointAt(0)!.toString(16)).join('-');
}

const NOTE_TAG = 'korean-reader';
const LOOKUP_BATCH_SIZE = 20;
const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (character) => entities[character]!);
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

function definitionField(entry: VocabularyEntry): string {
  const english = entry.definitions.length ? entry.definitions : entry.machineDefinitions ?? [];
  return [...english, ...entry.koreanDefinitions].map(escapeHtml).join('<br>');
}

function buildNote(entry: VocabularyEntry, settings: AnkiSettings): AnkiNote {
  const { deckName, modelName, fields } = settings;
  const values = {
    word: escapeHtml(entry.headword),
    sentence: [...sentenceFields(entry).values()].join('<br>'),
    definition: definitionField(entry),
    pronunciation: escapeHtml(entry.pronunciation ?? ''),
    image: '',
    audio: '',
  };
  const mapped = ANKI_FIELD_ROLES.flatMap((role) => fields[role] ? [[fields[role], values[role]]] : []);
  return { deckName, modelName, fields: Object.fromEntries(mapped), tags: [NOTE_TAG, headwordTag(entry.headword)], options: { allowDuplicate: false } };
}

function getFocusFields(entry: VocabularyEntry, settings: AnkiSettings): string[] {
  return [...new Set([settings.fields.word, ANKI_DEFAULT_FIELDS.word, entry.ankiFocusField])]
    .filter((field): field is string => !!field);
}

function searchTerms(entry: VocabularyEntry, settings: AnkiSettings): string[] {
  const searches = getFocusFields(entry, settings).map((field) =>
    `"${escapeSearch(field)}:${escapeSearch(entry.headword)}"`,
  );
  searches.push(`tag:${headwordTag(entry.headword)}`);
  if (entry.ankiNoteId) searches.push(`nid:${entry.ankiNoteId}`);
  return searches;
}

function exactMatch(note: AnkiNoteInfo, entry: VocabularyEntry, settings: AnkiSettings): boolean {
  return getFocusFields(entry, settings).some((field) =>
    plainText(note.fields[field]?.value ?? '') === entry.headword,
  );
}

async function fetchBatchNotes(
  client: AnkiClient,
  batch: VocabularyEntry[],
  settings: AnkiSettings,
): Promise<AnkiNoteInfo[]> {
  const query = [...new Set(batch.flatMap((entry) => searchTerms(entry, settings)))].join(' OR ');
  const ids = await client.request('findNotes', { query });
  return ids.length ? client.request('notesInfo', { notes: ids }) : [];
}

export async function countUnsynced(settings: AnkiSettings): Promise<number> {
  const client = new AnkiClient(settings);
  const entries = (await listVocabulary()).filter((entry) => entry.contexts.length);
  let count = 0;
  for (let index = 0; index < entries.length; index += LOOKUP_BATCH_SIZE) {
    const batch = entries.slice(index, index + LOOKUP_BATCH_SIZE);
    const notes = await fetchBatchNotes(client, batch, settings);
    count += batch.filter((entry) => !notes.some((note) =>
      exactMatch(note, entry, settings) || note.tags?.includes(headwordTag(entry.headword)),
    )).length;
  }
  return count;
}

function resolveExisting(
  notes: AnkiNoteInfo[],
  entry: VocabularyEntry,
  settings: AnkiSettings,
): AnkiNoteInfo | undefined {
  const matches = notes.filter((note) => exactMatch(note, entry, settings));
  if (!matches.length && notes.some((note) => note.tags?.includes(headwordTag(entry.headword)))) {
    throw new Error('A previously synced note exists. Check its focus word and field mapping in Anki.');
  }
  if (matches.length > 1) throw new Error('Multiple existing Anki notes have this headword. Resolve the duplicates in Anki.');
  return matches[0];
}

async function uploadImage(client: AnkiClient, entry: VocabularyEntry): Promise<string> {
  const image = entry.contexts.find((context) => context.image)?.image;
  if (!image) return '';
  const filename = `korean-reader-${crypto.randomUUID()}.jpg`;
  const stored = await client.request('storeMediaFile', { filename, data: image.slice('data:image/jpeg;base64,'.length) });
  return `<img src="${escapeHtml(stored)}">`;
}

async function attachAudio(
  client: AnkiClient,
  entry: VocabularyEntry,
  field: string | undefined,
  changes: Record<string, string>,
): Promise<string | undefined> {
  const clip = entry.contexts.find((context) => isSubtitleAudio(context.audio))?.audio;
  if (!field || !clip) return;
  try {
    const data = clip.slice(SUBTITLE_AUDIO_PREFIX.length);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    const id = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const filename = `korean-reader-${id}.webm`;
    const stored = await client.request('storeMediaFile', { filename, data });
    if (typeof stored !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(stored)) throw new Error('Invalid media filename.');
    changes[field] = `[sound:${stored}]`;
  } catch (error) {
    return `Subtitle audio could not be uploaded. Sync again to retry. ${errorMessage(error)}`;
  }
}

async function updateExistingNote(
  client: AnkiClient,
  existing: AnkiNoteInfo,
  entry: VocabularyEntry,
  settings: AnkiSettings,
): Promise<{ updated: boolean; message?: string }> {
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
  const merged = [current, ...added.map(([, html]) => html)].filter(Boolean).join('<br>');
  const changes: Record<string, string> = {};
  if (added.length) changes[field] = merged;
  const definition = settings.fields.definition;
  const currentDefinition = existing.fields[definition]?.value;
  const hasEnglish = entry.definitions.length || entry.machineDefinitions?.length;
  const koreanLines = entry.koreanDefinitions.map((text) => text.normalize('NFC').trim());
  const existingLines = currentDefinition === undefined ? [] : plainText(
    currentDefinition.replace(/<(?:br\b[^>]*|\/div|\/p)>/gi, '\n'),
  ).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (hasEnglish && currentDefinition !== undefined &&
    (!existingLines.length || existingLines.every((line, index) => line === koreanLines[index]))) {
    changes[definition] = definitionField(entry);
  }
  const imageField = settings.fields.image;
  if (imageField && existing.fields[imageField] && !existing.fields[imageField].value.trim()) {
    const image = await uploadImage(client, entry);
    if (image) changes[imageField] = image;
  }
  const audioField = settings.fields.audio;
  const message = audioField && existing.fields[audioField]?.value.trim() === ''
    ? await attachAudio(client, entry, audioField, changes)
    : undefined;
  if (!Object.keys(changes).length) return { updated: false, message };
  await client.request('updateNoteFields', { note: { id: existing.noteId, fields: changes } });
  const [updated] = await client.request('notesInfo', { notes: [existing.noteId] });
  if (!Object.entries(changes).every(([name, value]) => updated?.fields[name]?.value === value)) {
    throw new Error('Anki did not save the update. Close the note in Anki’s browser and retry.');
  }
  return { updated: true, message };
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

async function saveResult(headword: string, status: 'created' | 'updated' | 'existing', id: number, focusField: string, message?: string): Promise<AnkiSyncResult> {
  try {
    await recordAnkiSync(headword, id, focusField);
    return message ? { headword, status, message } : { headword, status };
  } catch {
    return { headword, status, message: [message, 'Anki succeeded, but the local sync marker could not be saved.'].filter(Boolean).join(' ') };
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
    const candidates: Array<{ headword: string; note: AnkiNote; message?: string }> = [];
    const pending: Array<{ headword: string; entry: VocabularyEntry }> = [];
    for (const headword of new Set(headwords.map((word) => word.trim().normalize('NFC')))) {
      try {
        const entry = await getVocabulary(headword);
        if (!entry) throw new Error('This word is no longer in your vocabulary.');
        if (!entry.contexts.length) continue;
        pending.push({ headword, entry });
      } catch (error) {
        results.push({ headword, status: 'failed', message: errorMessage(error) });
      }
    }

    for (let index = 0; index < pending.length; index += LOOKUP_BATCH_SIZE) {
      const batch = pending.slice(index, index + LOOKUP_BATCH_SIZE);
      let notes: AnkiNoteInfo[];
      try {
        notes = await fetchBatchNotes(client, batch.map(({ entry }) => entry), settings);
      } catch (error) {
        results.push(...batch.map(({ headword }): AnkiSyncResult =>
          ({ headword, status: 'failed', message: errorMessage(error) })));
        continue;
      }

      for (const { headword, entry } of batch) {
        try {
          const existing = resolveExisting(notes, entry, settings);
          if (existing) {
            const { updated, message } = await updateExistingNote(client, existing, entry, settings);
            results.push(await saveResult(headword, updated ? 'updated' : 'existing', existing.noteId, settings.fields.word, message));
          } else {
            const note = buildNote(entry, settings);
            if (settings.fields.image) note.fields[settings.fields.image] = await uploadImage(client, entry);
            const message = await attachAudio(client, entry, settings.fields.audio, note.fields);
            candidates.push({ headword, note, message });
          }
        } catch (error) {
          results.push({ headword, status: 'failed', message: errorMessage(error) });
        }
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
            ? await saveResult(candidate.headword, 'created', id, settings.fields.word, candidate.message)
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
