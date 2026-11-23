<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { browser } from 'wxt/browser';
import DictionaryPopup from './DictionaryPopup.vue';
import { importJapaneseDictionary, importJapaneseSupplement, readJapaneseDictionaryInfo } from '@/services/japanese/dictionary-store';
import { JMDICT_DOWNLOAD, type JapaneseDictionaryInfo } from '@/services/japanese/jmdict';
import type { LookupMessage, LookupResponse } from '@/types/messages';

defineProps<{ theme: 'dark' | 'light' }>();

const dictionary = ref<JapaneseDictionaryInfo>();
const busy = ref(false);
const status = ref('');
const installError = ref('');
const query = ref('');
const submitted = ref('');
const result = ref<LookupResponse>();
const lookingUp = ref(false);
let generation = 0;

onMounted(async () => {
  try {
    dictionary.value = await readJapaneseDictionaryInfo();
  } catch {
    installError.value = 'Could not read the Japanese dictionary from local storage.';
  }
});

async function install(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || busy.value) return;
  busy.value = true;
  status.value = '';
  installError.value = '';
  clearLookup();
  try {
    dictionary.value = await importJapaneseDictionary(file);
    status.value = 'Japanese dictionary installed.';
  } catch (error) {
    installError.value = error instanceof Error ? error.message : 'Could not install the Japanese dictionary.';
  } finally {
    busy.value = false;
  }
}

async function installSupplement(event: Event, kind: 'ranks' | 'kanji') {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || busy.value) return;
  busy.value = true;
  status.value = '';
  installError.value = '';
  clearLookup();
  try {
    const count = await importJapaneseSupplement(file, kind);
    status.value = `${count.toLocaleString()} ${kind === 'ranks' ? 'frequency ranks' : 'kanji entries'} installed.`;
  } catch (error) {
    installError.value = error instanceof Error ? error.message : 'Could not install this dictionary data.';
  } finally {
    busy.value = false;
  }
}

function clearLookup() {
  generation += 1;
  submitted.value = '';
  result.value = undefined;
  lookingUp.value = false;
}

watch(query, clearLookup);

async function lookup() {
  if (!query.value.trim() || busy.value || !dictionary.value) return;
  const current = ++generation;
  submitted.value = query.value.trim();
  lookingUp.value = true;
  result.value = undefined;
  try {
    const response: LookupResponse | undefined = await browser.runtime.sendMessage({
      type: 'lookup', language: 'ja', word: submitted.value, morphemes: [],
    } satisfies LookupMessage);
    if (generation === current) result.value = response ?? { ok: false, error: 'Could not look up this word.' };
  } catch {
    if (generation === current) result.value = { ok: false, error: 'Could not look up this word.' };
  } finally {
    if (generation === current) lookingUp.value = false;
  }
}
</script>

<template>
  <section class="mt-5 space-y-2 border-t border-interface/10 pt-4" aria-labelledby="jp-dictionary-heading">
    <h3 id="jp-dictionary-heading" class="text-sm font-medium">Japanese dictionary</h3>
    <p class="text-xs text-muted">
      <a :href="JMDICT_DOWNLOAD" target="_blank" rel="noopener noreferrer" class="underline">Download the English JMdict archive</a> and import it once for offline lookup.
    </p>
    <label class="block text-xs">
      {{ dictionary ? 'Replace dictionary' : 'Import dictionary' }}
      <input type="file" accept=".json,.tgz,.gz" class="mt-1 block max-w-full text-xs text-muted" :disabled="busy" @change="install" />
    </label>
    <details class="space-y-2 text-xs">
      <summary class="cursor-pointer">Frequency ranks and kanji details</summary>
      <label class="block">
        Jiten frequency CSV
        <input type="file" accept=".csv,text/csv" class="mt-1 block max-w-full text-muted" :disabled="busy" @change="installSupplement($event, 'ranks')" />
      </label>
      <p class="text-muted"><a href="https://jiten.moe/frequency-dictionaries" target="_blank" rel="noopener noreferrer" class="underline">Jiten frequency lists</a> are CC BY-SA 4.0.</p>
      <label class="block">
        KANJIDIC2 English readings and meanings
        <input type="file" accept=".json,.tgz,.gz" class="mt-1 block max-w-full text-muted" :disabled="busy" @change="installSupplement($event, 'kanji')" />
      </label>
      <p class="text-muted"><a href="https://github.com/scriptin/jmdict-simplified/releases" target="_blank" rel="noopener noreferrer" class="underline">JMdict Simplified releases</a> include English or multilingual KANJIDIC2 archives from EDRDG.</p>
    </details>
    <p v-if="busy || status" role="status" class="text-xs text-muted">{{ busy ? 'Indexing Japanese words…' : status }}</p>
    <p v-if="installError" role="alert" class="text-xs text-danger">{{ installError }}</p>
    <p v-if="dictionary" class="text-xs text-muted">JMdict {{ dictionary.version }} · {{ dictionary.date }} · {{ dictionary.words.toLocaleString() }} entries</p>
    <p class="text-xs text-muted">
      JMdict data © Jim Breen and the Electronic Dictionary Research and Development Group.
      <a href="https://www.edrdg.org/edrdg/licence.html" target="_blank" rel="noopener noreferrer" class="underline">CC BY-SA 4.0 and source credits</a>.
      Where present, examples come from the Tanaka corpus maintained by Tatoeba.
    </p>
    <form v-if="dictionary" class="flex flex-wrap items-end gap-2" @submit.prevent="lookup">
      <label class="grid flex-1 gap-1 text-xs">
        Try a Japanese word
        <input v-model="query" lang="ja" maxlength="100" :disabled="busy" class="rounded-lg border border-interface/15 bg-ink px-2 py-1.5" />
      </label>
      <button type="submit" :disabled="busy || lookingUp || !query.trim()" class="rounded-lg bg-accent px-3 py-1.5 text-xs text-white disabled:opacity-50">
        Look up
      </button>
    </form>
    <div v-if="submitted" class="dictionary-preview kr-subtitles" :data-theme="theme">
      <DictionaryPopup
        :entry="result?.entry ?? null"
        :japanese-matches="result?.japaneseMatches"
        :original-form="submitted"
        :loading="lookingUp"
        :error="result?.error ?? null"
        :style="{ position: 'relative', zIndex: 'auto', transform: 'none', width: '100%', maxHeight: '24rem' }"
        @close="clearLookup"
      />
    </div>
  </section>
</template>

<style src="../assets/subtitle-overlay.css"></style>
<style scoped>
.dictionary-preview { width: 100%; max-width: none; padding: 0; }
.dictionary-preview :deep(.kr-dictionary-popup) { padding: 0.8rem; font-size: 0.875rem; box-shadow: none; }
.dictionary-preview :deep(.kr-dictionary-heading h2) { font-size: 1.25rem; }
.dictionary-preview :deep(.kr-dictionary-original),
.dictionary-preview :deep(.kr-dictionary-section h3),
.dictionary-preview :deep(.kr-dictionary-close) { font-size: 1rem; }
</style>
