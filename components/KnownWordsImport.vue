<script setup lang="ts">
import { ref } from 'vue';
import { browser } from 'wxt/browser';
import { downloadJson } from '@/services/storage/download';
import { plainText } from '@/services/anki/fields';
import { encodeJapaneseKnownWords, parseJapaneseKnownWords, encodeKnownWords, isKoreanHeadword, MAX_KNOWN_WORD_FILE_BYTES, parseKnownWords } from '@/services/storage/known-words';
import type { ReaderLanguage } from '@/types/language';
import type { AnkiImportPreview } from '@/types/anki';
import type { JapaneseKnownWord, KnownHeadwordsResponse } from '@/types/vocabulary';

const props = defineProps<{ language?: ReaderLanguage }>();
const japaneseWords = ref<JapaneseKnownWord[]>([]);
const emit = defineEmits<{ imported: [] }>();
const words = ref<string[]>([]);
const notice = ref('');
const error = ref('');
const busy = ref(false);

async function exportWords() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    if (props.language === 'ja') {
      const response = await browser.runtime.sendMessage({ type: 'export-japanese-known-words' });
      if (!response?.ok) throw new Error(response?.error ?? 'Could not export Japanese known words.');
      downloadJson('japanese-reader-known-words.json', encodeJapaneseKnownWords(response.words));
      notice.value = `${response.words.length.toLocaleString()} known words exported.`;
      return;
    }
    const response: KnownHeadwordsResponse = await browser.runtime.sendMessage({ type: 'get-known-headwords' });
    if (!response?.ok || !response.headwords) throw new Error('Could not read known words.');
    downloadJson('korean-reader-known-words.json', encodeKnownWords(response.headwords));
    notice.value = `${response.headwords.length.toLocaleString()} known words exported.`;
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'Could not export known words.';
  } finally {
    busy.value = false;
  }
}

async function readFile(event: Event, format: 'korean-reader' | 'kimchi' | 'anki') {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || busy.value) return;
  words.value = [];
  japaneseWords.value = [];
  notice.value = '';
  error.value = '';
  busy.value = true;
  try {
    if (file.size > MAX_KNOWN_WORD_FILE_BYTES) throw new Error('This known-word file is too large.');
    const text = (await file.text()).replace(/^\uFEFF/, '');
    if (props.language === 'ja') {
      if (format === 'korean-reader') {
        japaneseWords.value = parseJapaneseKnownWords(text);
        notice.value = `${japaneseWords.value.length.toLocaleString()} Japanese words found.`;
      } else {
        const terms = parseJapaneseText(text);
        const result: { ok: boolean; error?: string; preview?: AnkiImportPreview } | undefined =
          await browser.runtime.sendMessage({ type: 'preview-japanese-known-words', terms });
        if (!result?.ok || !result.preview) throw new Error(result?.error ?? 'Could not preview Japanese words.');
        japaneseWords.value = result.preview.japaneseWords ?? [];
        notice.value = `${japaneseWords.value.length} to mark known · ${result.preview.alreadyKnown} already known · ${result.preview.skipped} unresolved`;
      }
      words.value = japaneseWords.value.map(({ headword, japanese }) => headword + ' · ' + japanese.reading);
      return;
    }
    if (format === 'korean-reader') {
      words.value = parseKnownWords(text);
    } else {
      words.value = parseWordList(text, format);
    }
    notice.value = `${words.value.length.toLocaleString()} Korean words found.`;
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'Could not read the file.';
  } finally {
    input.value = '';
    busy.value = false;
  }
}

function parseWordList(text: string, format: 'kimchi' | 'anki'): string[] {
  const imported = new Set<string>();
  let field = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let value: string;
    if (format === 'kimchi') {
      const match = line.match(/^\s*(?:"((?:[^"]|"")*)"|([^,]*)),\s*([0-3])\s*$/);
      if (!match) throw new Error('Choose a Kimchi Reader word status CSV.');
      value = match[1]?.replace(/""/g, '"') ?? match[2] ?? '';
      if (!/\p{Script=Hangul}/u.test(value)) throw new Error('The file contains an invalid Korean word.');
      if (match[3] !== '2') continue;
    } else {
      if (line.startsWith('#columns:')) {
        const names = line.slice('#columns:'.length).split('\t').map((name) => name.trim().toLowerCase());
        const focusColumn = names.findIndex((name) => /^focus ?word$/.test(name));
        const wordColumn = names.findIndex((name) => /^(word|expression|vocabulary|korean|front)$/.test(name));
        field = focusColumn >= 0 ? focusColumn : Math.max(wordColumn, 0);
      }
      if (line.startsWith('#')) continue;
      value = plainText((line.split('\t')[field] ?? '').replace(/\[sound:[^\]]*\]/gi, '').replace(/^"|"$/g, ''));
    }
    const word = value.trim().normalize('NFC');
    if (isKoreanHeadword(word)) imported.add(word);
  }
  return [...imported];
}

function parseJapaneseText(text: string) {
  let wordIndex = 0;
  let readingIndex = 1;
  return text.split(/\r?\n/u).flatMap((line) => {
    if (line.startsWith('#columns:')) {
      const columns = line.slice(9).split('\t').map((column) => column.toLowerCase().trim());
      wordIndex = Math.max(0, columns.findIndex((column) => /^(focus ?word|word|expression|vocabulary|japanese|front)$/u.test(column)));
      readingIndex = columns.findIndex((column) => /^(reading|pronunciation|kana|furigana)$/u.test(column));
    }
    if (!line.trim() || line.startsWith('#')) return [];
    const fields = line.split('\t').map((field) => plainText(field.replace(/^"|"$/gu, '').replace(/\[sound:[^\]]*\]/giu, '')));
    const word = fields[wordIndex] ?? '';
    const reading = fields[readingIndex] ?? '';
    return word && word.length <= 100 && reading.length <= 100 ? [{ word, reading }] : [];
  });
}

async function importWords() {
  if (!words.value.length || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const result = await browser.runtime.sendMessage(props.language === 'ja'
      ? { type: 'import-known-headwords', language: 'ja', words: japaneseWords.value }
      : { type: 'import-known-headwords', headwords: words.value });
    if (!result?.ok) throw new Error(result?.error ?? 'Could not import known words.');
    words.value = [];
    japaneseWords.value = [];
    const marked = Number(result.marked);
    notice.value = `${marked.toLocaleString()} ${marked === 1 ? 'word' : 'words'} marked known.`;
    emit('imported');
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'Could not import known words.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <button type="button" :disabled="busy" class="rounded-lg border border-interface/15 px-3 py-1.5 text-xs disabled:opacity-50" @click="exportWords">Export known words</button>
    <label class="block space-y-1.5 text-sm font-medium">
      <span>Korean Reader known-word file</span>
      <span class="block text-xs font-normal text-muted">Import a JSON export from another computer to merge its known words into this browser.</span>
      <input type="file" accept=".json,application/json" :disabled="busy" class="block text-xs text-muted" @change="readFile($event, 'korean-reader')" />
    </label>
    <label class="block space-y-1.5 text-sm font-medium">
      <span>{{ language === 'ja' ? 'Japanese word list or Anki notes export' : 'Anki notes text export' }}</span>
      <span class="block text-xs font-normal text-muted">{{ language === 'ja' ? 'Use one word per line or add a kana reading in the second tab-separated column.' : 'Export Notes in Plain Text from Anki. The importer uses the named focus-word column or the first field.' }}</span>
      <input type="file" accept=".txt,.tsv,text/plain" :disabled="busy" class="block text-xs text-muted" @change="readFile($event, 'anki')" />
    </label>
    <label v-if="language !== 'ja'" class="block space-y-1.5 text-sm font-medium">
      <span>Kimchi Reader word status CSV</span>
      <span class="block text-xs font-normal text-muted">Words with status 2 are marked known.</span>
      <input type="file" accept=".csv,text/csv" :disabled="busy" class="block text-xs text-muted" @change="readFile($event, 'kimchi')" />
    </label>
    <p v-if="error" role="alert" class="text-xs text-danger">{{ error }}</p>
    <p v-if="notice" role="status" class="text-xs text-muted">{{ notice }}</p>
    <p v-if="words.length" :lang="language ?? 'ko'" class="break-words text-xs text-muted">{{ words.slice(0, 12).join(', ') }}</p>
    <button v-if="words.length" type="button" data-import :disabled="busy" class="rounded-lg bg-accent px-3 py-1.5 text-xs text-white disabled:opacity-50" @click="importWords">Mark words known</button>
  </div>
</template>
