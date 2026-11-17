<script setup lang="ts">
import AnkiPanel from '@/components/AnkiPanel.vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { OPEN_TRANSCRIPT } from '@/services/youtube/transcript';
import { browser } from 'wxt/browser';
import { VOCABULARY_REVISION_KEY, type VocabularyEntry, type VocabularyResponse } from '@/types/vocabulary';
import logo from '@/assets/penguin.png';
import stars from '@/assets/stars.png';

const entries = ref<VocabularyEntry[]>();
const minedEntries = computed(() => entries.value?.filter((entry) => entry.contexts.length) ?? []);
const knownCount = computed(() => entries.value?.filter((entry) => entry.status === 'known').length);
const error = ref('');
const sidebarError = ref('');
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
const version = browser.runtime.getManifest().version;
let loadGeneration = 0;
async function loadVocabulary() {
  const generation = ++loadGeneration;
  try {
    const response: VocabularyResponse | undefined = await browser.runtime.sendMessage({ type: 'list-vocabulary' });
    if (generation !== loadGeneration) return;
    if (!response?.ok) throw new Error(response?.error ?? 'Could not access saved vocabulary.');
    entries.value = response.entries ?? [];
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
        <img :src="logo" alt="" class="size-9 rounded-xl object-cover" />
        <h1 class="min-w-0 truncate text-base font-semibold tracking-tight">Korean Reader</h1>
        <button type="button" class="ml-auto grid size-8 shrink-0 place-items-center rounded-lg border border-interface/10 text-muted transition-colors hover:bg-interface/10 hover:text-paper" aria-label="Open settings" title="Open settings" @click="browser.runtime.openOptionsPage()">
          <span aria-hidden="true">⚙</span>
        </button>
      </div>
    </header>
    <section class="flex-1 space-y-3 bg-cover bg-center px-5 py-5" :style="{ backgroundImage: `linear-gradient(var(--reading-backdrop), var(--reading-backdrop)), url(${stars})` }">
      <AnkiPanel :vocabulary="minedEntries" :known-count="knownCount" @synced="loadVocabulary" />
      <button type="button" class="w-full rounded-lg border border-interface/20 px-3 py-2 text-sm font-medium hover:bg-interface/10" @click="openSidebar">Open Sidebar</button>
      <p v-if="sidebarError" class="text-xs text-danger" role="alert">{{ sidebarError }}</p>
      <div v-if="error" class="text-xs text-danger" role="alert">{{ error }} <button class="underline" @click="loadVocabulary">Reload</button></div>
      <p class="text-xs text-muted">Version {{ version }}</p>
    </section>
  </main>
</template>
