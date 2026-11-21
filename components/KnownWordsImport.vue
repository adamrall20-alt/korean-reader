<script setup lang="ts">
import { ref } from 'vue';
import { browser } from 'wxt/browser';

const emit = defineEmits<{ imported: [] }>();
const words = ref<string[]>([]);
const notice = ref('');
const error = ref('');
const busy = ref(false);

async function readFile(event: Event, format: 'kimchi' | 'anki') {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || busy.value) return;
  words.value = [];
  notice.value = '';
  error.value = '';
  busy.value = true;
  try {
    const text = (await file.text()).replace(/^\uFEFF/, '');
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
        const columns = line.split('\t');
        if (line.startsWith('#columns:')) {
          const names = line.slice('#columns:'.length).split('\t');
          const wordColumn = names.findIndex((name) => /^(focus word|word|expression|vocabulary|korean|front)$/i.test(name.trim()));
          if (wordColumn >= 0) field = wordColumn;
        }
        if (line.startsWith('#')) continue;
        value = (columns[field] ?? '').replace(/<[^>]+>|\[sound:[^\]]*\]/gi, '').replace(/^"|"$/g, '');
      }
      const word = value.trim().normalize('NFC');
      if (/\p{Script=Hangul}/u.test(word) && word.length <= 100) imported.add(word);
    }
    words.value = [...imported];
    notice.value = `${words.value.length.toLocaleString()} Korean words found.`;
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'Could not read the file.';
  } finally {
    input.value = '';
    busy.value = false;
  }
}

async function importWords() {
  if (!words.value.length || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const result = await browser.runtime.sendMessage({ type: 'import-known-headwords', headwords: words.value });
    if (!result?.ok) throw new Error(result?.error ?? 'Could not import known words.');
    words.value = [];
    notice.value = `${Number(result.marked).toLocaleString()} words marked known.`;
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
    <label class="block space-y-1.5 text-sm font-medium">
      <span>Anki notes text export</span>
      <span class="block text-xs font-normal text-muted">Export Notes in Plain Text from Anki. The importer uses the named focus-word column or the first field.</span>
      <input type="file" accept=".txt,.tsv,text/plain" :disabled="busy" class="block text-xs text-muted" @change="readFile($event, 'anki')" />
    </label>
    <label class="block space-y-1.5 text-sm font-medium">
      <span>Kimchi Reader word status CSV</span>
      <span class="block text-xs font-normal text-muted">Words with status 2 are marked known.</span>
      <input type="file" accept=".csv,text/csv" :disabled="busy" class="block text-xs text-muted" @change="readFile($event, 'kimchi')" />
    </label>
    <p v-if="error" role="alert" class="text-xs text-danger">{{ error }}</p>
    <p v-if="notice" role="status" class="text-xs text-muted">{{ notice }}</p>
    <p v-if="words.length" lang="ko" class="break-words text-xs text-muted">{{ words.slice(0, 12).join(', ') }}</p>
    <button v-if="words.length" type="button" :disabled="busy" class="rounded-lg bg-accent px-3 py-1.5 text-xs text-white disabled:opacity-50" @click="importWords">Mark words known</button>
  </div>
</template>
