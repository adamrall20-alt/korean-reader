<script setup lang="ts">
import AnkiPanel from '@/components/AnkiPanel.vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { OPEN_TRANSCRIPT } from '@/services/youtube/transcript';
import { TOGGLE_PARSE_PAGE } from '@/services/webpage/parser';
import { browser } from 'wxt/browser';
import { VOCABULARY_REVISION_KEY, type VocabularySummary, type VocabularyResponse } from '@/types/vocabulary';
import PenguinMark from './PenguinMark.vue';
import ReaderIcon from './ReaderIcon.vue';
import stars from '@/assets/stars.png';

const summary = ref<VocabularySummary>();
const minedEntries = computed(() => summary.value?.minedEntries ?? []);
const knownCount = computed(() => summary.value?.knownCount);
const error = ref('');
const sidebarError = ref('');
const parseError = ref('');
const parsing = ref(false);
async function openSidebar() {
  sidebarError.value = '';
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) throw new Error();
    const response = await browser.tabs.sendMessage(tab.id, { type: OPEN_TRANSCRIPT });
    if (!response?.ok) throw new Error();
    window.close();
  } catch {
    sidebarError.value = 'Open or refresh a YouTube video, then try again.';
  }
}
async function parsePage() {
  if (parsing.value) return;
  parseError.value = '';
  parsing.value = true;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) throw new Error();
    await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['/page-parser.js'] });
    const response = await browser.tabs.sendMessage(tab.id, { type: TOGGLE_PARSE_PAGE });
    if (!response?.ok) throw new Error(response?.error);
    window.close();
  } catch {
    parseError.value = 'Open a standard webpage (not a Chrome internal page), then try again.';
  } finally {
    parsing.value = false;
  }
}
const version = browser.runtime.getManifest().version;
let loadGeneration = 0;
async function loadVocabulary() {
  const generation = ++loadGeneration;
  try {
    const response: VocabularyResponse | undefined = await browser.runtime.sendMessage({
      type: 'get-vocabulary-summary',
    });
    if (generation !== loadGeneration) return;
    if (!response?.ok) throw new Error(response?.error ?? 'Could not access saved vocabulary.');
    summary.value = response.summary ?? { knownCount: 0, minedEntries: [] };
    error.value = '';
  } catch (failure) {
    if (generation !== loadGeneration) return;
    error.value = failure instanceof Error ? failure.message : 'Could not access saved vocabulary.';
  }
}
const onStorageChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
  if (area === 'local' && VOCABULARY_REVISION_KEY in changes) void loadVocabulary();
};
onMounted(() => {
  browser.storage.onChanged.addListener(onStorageChanged);
  void loadVocabulary();
});
onBeforeUnmount(() => browser.storage.onChanged.removeListener(onStorageChanged));
</script>

<template>
  <main class="flex min-h-[280px] flex-col bg-ink text-paper">
    <header class="border-b border-interface/10 px-5 py-4">
      <div class="flex items-center gap-3">
        <PenguinMark />
        <h1 class="min-w-0 truncate text-base font-semibold tracking-tight">Korean Reader</h1>
        <div class="ml-auto flex shrink-0 items-center gap-1.5">
          <button type="button" class="reader-icon-link grid size-8 place-items-center rounded-lg border border-interface/10 text-accent hover:bg-accent/10" aria-label="Open Statistics" title="Open Statistics" @click="browser.tabs.create({ url: browser.runtime.getURL('/statistics.html') })">
            <ReaderIcon name="statistics" class="size-4" />
          </button>
          <button type="button" class="reader-icon-link grid size-8 shrink-0 place-items-center rounded-lg border border-interface/10 text-muted transition-colors hover:bg-interface/10 hover:text-paper" aria-label="Open settings" title="Open settings" @click="browser.runtime.openOptionsPage()">
            <ReaderIcon name="settings" class="size-4" />
          </button>
        </div>
      </div>
    </header>
    <section class="flex-1 space-y-3 bg-cover bg-center px-5 py-5" :style="{ backgroundImage: `linear-gradient(var(--reading-backdrop), var(--reading-backdrop)), url(${stars})` }">
      <label class="flex items-center justify-between gap-2 text-xs text-muted">
        Reading language
        <select class="rounded-lg border border-interface/15 bg-ink px-2 py-1 text-paper">
          <option value="ko">Korean</option>
          <option value="ja" disabled>Japanese (coming soon)</option>
        </select>
      </label>
      <AnkiPanel :vocabulary="minedEntries" :known-count="knownCount" @synced="loadVocabulary" />
      <button type="button" class="reader-icon-link flex w-full items-center justify-center gap-2 rounded-lg border border-interface/20 px-3 py-2 text-sm font-medium hover:bg-interface/10" @click="openSidebar">
        <ReaderIcon name="transcript" class="size-4 text-accent" /> Open Sidebar
      </button>
      <p v-if="sidebarError" class="text-xs text-danger" role="alert">{{ sidebarError }}</p>
      <button type="button" :disabled="parsing" class="reader-icon-link flex w-full items-center justify-center gap-2 rounded-lg border border-interface/20 px-3 py-2 text-sm font-medium hover:bg-interface/10 disabled:opacity-50" @click="parsePage">
        <ReaderIcon name="page" class="size-4 text-accent" /> {{ parsing ? 'Parsing…' : 'Parse Page' }}
      </button>
      <p v-if="parseError" class="text-xs text-danger" role="alert">{{ parseError }}</p>
      <div v-if="error" class="text-xs text-danger" role="alert">{{ error }} <button class="underline" @click="loadVocabulary">Reload</button></div>
      <p class="text-xs text-muted">Version {{ version }}</p>
    </section>
  </main>
</template>
