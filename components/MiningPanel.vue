<script setup lang="ts">
import AnkiPanel from '@/components/AnkiPanel.vue';
import { onMounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import type { VocabularyEntry, VocabularyResponse } from '@/types/vocabulary';
import logo from '@/assets/penguin.png';
import stars from '@/assets/stars.png';

const entries = ref<VocabularyEntry[]>([]);
const error = ref('');
const version = browser.runtime.getManifest().version;
async function loadVocabulary() {
  try {
    const response: VocabularyResponse | undefined = await browser.runtime.sendMessage({ type: 'list-vocabulary' });
    if (!response?.ok) throw new Error(response?.error ?? 'Could not access saved vocabulary.');
    entries.value = response.entries ?? [];
    error.value = '';
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'Could not access saved vocabulary.';
  }
}
onMounted(loadVocabulary);
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
      <AnkiPanel :vocabulary="entries" @synced="loadVocabulary" />
      <div v-if="error" class="text-xs text-red-300" role="alert">{{ error }} <button class="underline" @click="loadVocabulary">Reload</button></div>
      <p class="text-xs text-muted">Version {{ version }}</p>
    </section>
  </main>
</template>
