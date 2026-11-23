<script setup lang="ts">
import AnkiPanel from '@/components/AnkiPanel.vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { OPEN_TRANSCRIPT } from '@/services/youtube/transcript';
import { TOGGLE_PARSE_PAGE } from '@/services/webpage/parser';
import { browser } from 'wxt/browser';
import { GET_READING_LANGUAGE, READING_LANGUAGE_CHANGED, SET_READING_LANGUAGE, readingLanguage, type ReaderLanguage } from '@/types/language';
import { readJapaneseDictionaryInfo } from '@/services/japanese/dictionary-store';
import { vocabularyRevisionKey, type VocabularySummary, type VocabularyResponse } from '@/types/vocabulary';
import PenguinMark from './PenguinMark.vue';
import ReaderIcon from './ReaderIcon.vue';
import stars from '@/assets/stars.png';

const language = ref<ReaderLanguage>('ko');
const languageReady = ref(false);
const dictionaryReady = ref(false);
const changingLanguage = ref(false);
let activeTabId: number | undefined;
async function chooseLanguage(event: Event) {
  const target = event.target as HTMLSelectElement;
  const next = readingLanguage(target.value);
  if (next === language.value || changingLanguage.value || (next === 'ja' && !dictionaryReady.value)) return;
  changingLanguage.value = true;
  try {
    const result = await browser.runtime.sendMessage({ type: SET_READING_LANGUAGE, language: next, tabId: activeTabId });
    if (!result?.ok) throw new Error('Could not save the reading language.');
    if (activeTabId !== undefined) await browser.tabs.sendMessage(activeTabId, { type: READING_LANGUAGE_CHANGED, language: next }).catch(() => {});
    language.value = next;
    summary.value = undefined;
    await loadVocabulary();
  } catch {
    target.value = language.value;
    error.value = 'Could not save the reading language.';
  } finally {
    changingLanguage.value = false;
  }
}
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
    const response = await browser.tabs.sendMessage(tab.id, { type: TOGGLE_PARSE_PAGE, ...(language.value === 'ja' ? { language: language.value } : {}) });
    if (!response?.ok) throw new Error(response?.error || 'Could not parse this page.');
    window.close();
  } catch (failure) {
    parseError.value = failure instanceof Error && failure.message ? failure.message : 'Open a regular webpage and try again.';
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
      type: 'get-vocabulary-summary', ...(language.value === 'ja' ? { language: language.value } : {}),
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
  if (area === 'local' && vocabularyRevisionKey(language.value) in changes) void loadVocabulary();
};
onMounted(async () => {
  browser.storage.onChanged.addListener(onStorageChanged);
  const dictionary = readJapaneseDictionaryInfo().catch(() => undefined);
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    activeTabId = tab?.id;
    const current = await browser.runtime.sendMessage({ type: GET_READING_LANGUAGE, tabId: activeTabId });
    if (current?.ok) language.value = readingLanguage(current.language);
  } catch {
    // Korean remains the default when the toolbar cannot resolve a tab.
  } finally {
    dictionaryReady.value = !!(await dictionary);
    languageReady.value = true;
    void loadVocabulary();
  }
});
onBeforeUnmount(() => browser.storage.onChanged.removeListener(onStorageChanged));
</script>

<template>
  <main class="flex min-h-[280px] flex-col bg-ink text-paper">
    <header class="flex items-center gap-3 border-b border-line bg-cover bg-center px-4 py-3" :style="{ backgroundImage: `linear-gradient(var(--reading-backdrop), var(--reading-backdrop)), url(${stars})` }">
      <PenguinMark />
      <h1 class="min-w-0 text-base font-semibold tracking-tight">Korean Reader</h1>
      <nav aria-label="Extension pages" class="ml-auto flex shrink-0 items-center gap-1">
        <button type="button" class="reader-icon-link grid size-9 place-items-center rounded-lg text-muted hover:bg-interface/10 hover:text-paper" aria-label="Open Statistics" title="Open Statistics" @click="browser.tabs.create({ url: browser.runtime.getURL(language === 'ja' ? '/statistics.html?language=ja' : '/statistics.html') })">
          <ReaderIcon name="statistics" class="size-4" />
        </button>
        <button type="button" class="reader-icon-link grid size-9 place-items-center rounded-lg text-muted hover:bg-interface/10 hover:text-paper" aria-label="Open settings" title="Open settings" @click="browser.runtime.openOptionsPage()">
          <ReaderIcon name="settings" class="size-4" />
        </button>
      </nav>
    </header>

    <div class="flex-1 space-y-4 px-4 pt-4">
      <section role="region" aria-labelledby="toolbar-reading-title" class="space-y-2">
        <h2 id="toolbar-reading-title" class="text-sm font-semibold">Reading tools</h2>
        <label class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-soft px-3 py-1.5 text-sm">
          Reading language
          <select :value="language" :disabled="!languageReady || changingLanguage || parsing" class="min-h-8 max-w-full rounded-md border border-line bg-ink px-2 text-xs text-paper" @change="chooseLanguage">
            <option value="ko">Korean</option>
            <option value="ja" :disabled="!dictionaryReady">Japanese{{ dictionaryReady ? '' : ' (import JMdict)' }}</option>
          </select>
        </label>
        <div class="grid grid-cols-2 gap-2">
          <button type="button" class="reader-icon-link flex min-h-10 items-center justify-center gap-2 rounded-lg border border-line px-2 py-2 text-sm font-medium hover:bg-interface/10" aria-describedby="toolbar-sidebar-hint" @click="openSidebar">
            <ReaderIcon name="transcript" class="size-4 shrink-0 text-accent" /> Open Sidebar
          </button>
          <button type="button" :disabled="parsing" class="reader-icon-link flex min-h-10 items-center justify-center gap-2 rounded-lg border border-line px-2 py-2 text-sm font-medium hover:bg-interface/10 disabled:opacity-50" aria-describedby="toolbar-parse-hint" @click="parsePage">
            <ReaderIcon name="page" class="size-4 shrink-0 text-accent" /> {{ parsing ? 'Parsing…' : 'Parse Page' }}
          </button>
        </div>
        <div class="grid grid-cols-2 gap-2 text-center text-xs text-muted">
          <p id="toolbar-sidebar-hint">YouTube transcript</p>
          <p id="toolbar-parse-hint">Read or restore a webpage</p>
        </div>
        <p v-if="sidebarError" class="text-xs text-danger" role="alert">{{ sidebarError }}</p>
        <p v-if="parseError" class="text-xs text-danger" role="alert">{{ parseError }}</p>
      </section>

      <section role="region" aria-labelledby="toolbar-anki-title" class="space-y-2 border-t border-line pt-3">
        <h2 id="toolbar-anki-title" class="text-sm font-semibold">Anki &amp; vocabulary</h2>
        <AnkiPanel :key="language" :language="language" :vocabulary="minedEntries" :known-count="knownCount" @synced="loadVocabulary" />
        <div v-if="error" class="text-xs text-danger" role="alert">{{ error }} <button type="button" class="underline" @click="loadVocabulary">Reload</button></div>
      </section>
    </div>
    <footer class="px-4 py-3 text-right text-xs text-muted">Version {{ version }}</footer>
  </main>
</template>
