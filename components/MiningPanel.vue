<script setup lang="ts">
import AnkiPanel from '@/components/AnkiPanel.vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import { VOCABULARY_REVISION_KEY, type VocabularyEntry, type VocabularyResponse } from '@/types/vocabulary';
import logo from '@/assets/penguin.png';
import stars from '@/assets/stars.png';

const entries = ref<VocabularyEntry[]>();
const minedEntries = computed(() => entries.value?.filter((entry) => entry.contexts.length) ?? []);
const knownCount = computed(() => entries.value?.filter((entry) => entry.status === 'known').length);
const error = ref('');
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
    <header class="border-b border-white/10 px-5 py-4">
      <div class="flex items-center gap-3">
        <img :src="logo" alt="" class="size-9 rounded-xl object-cover" />
        <h1 class="min-w-0 truncate text-base font-semibold tracking-tight">Korean Reader</h1>
        <button type="button" class="ml-auto grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 text-muted transition-colors hover:bg-white/10 hover:text-paper" aria-label="Open settings" title="Open settings" @click="browser.runtime.openOptionsPage()">
          <span aria-hidden="true">⚙</span>
        </button>
      </div>
    </header>
    <section class="flex-1 space-y-3 bg-cover bg-center px-5 py-5" :style="{ backgroundImage: `linear-gradient(rgba(17,17,17,.65), rgba(17,17,17,.65)), url(${stars})` }">
      <AnkiPanel :vocabulary="minedEntries" :known-count="knownCount" @synced="loadVocabulary" />
      <div v-if="error" class="text-xs text-red-300" role="alert">{{ error }} <button class="underline" @click="loadVocabulary">Reload</button></div>
      <p class="text-xs text-muted">Version {{ version }}</p>
    </section>
  </main>
</template>
