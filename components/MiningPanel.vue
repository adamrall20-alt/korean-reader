<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { KnownWordHistory } from '@/types/statistics';
import { OPEN_TRANSCRIPT } from '@/services/youtube/transcript';
import { TOGGLE_PARSE_PAGE } from '@/services/webpage/parser';
import { browser } from 'wxt/browser';
import logo from '@/assets/New logo update.png';
import stars from '@/assets/stars.png';

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
const history = ref<KnownWordHistory>();
const historyError = ref(false);
const desktopStatus = ref<'sending' | 'sent' | 'unavailable'>('sending');
const knownCount = computed(() => (history.value?.days.at(-1) ?? history.value?.baseline)?.count);
async function loadKnownWords() {
  try {
    const response = await browser.runtime.sendMessage({ type: 'get-known-word-history' });
    historyError.value = !response?.ok || !response.history;
    if (!historyError.value) history.value = response.history;
  } catch {
    historyError.value = true;
  }
}

async function sendHistory() {
  desktopStatus.value = 'sending';
  try {
    const response = await browser.runtime.sendMessage({ type: 'sync-desktop-history' });
    desktopStatus.value = response?.ok ? 'sent' : 'unavailable';
  } catch {
    desktopStatus.value = 'unavailable';
  }
}

function exportHistory() {
  if (!history.value) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(history.value)], { type: 'application/json' }));
  const download = document.createElement('a');
  download.href = url;
  download.download = 'korean-reader-known-history.json';
  download.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

onMounted(() => {
  void loadKnownWords();
  void sendHistory();
});
</script>

<template>
  <main class="flex min-h-[280px] flex-col bg-ink text-paper">
    <header class="border-b border-interface/10 px-5 py-4">
      <div class="flex items-center gap-3">
        <img :src="logo" alt="" class="size-9 object-contain" />
        <h1 class="min-w-0 truncate text-base font-semibold tracking-tight">Korean Reader</h1>
        <div class="ml-auto flex shrink-0 items-center gap-1.5">
          <button type="button" class="grid size-8 shrink-0 place-items-center rounded-lg border border-interface/10 text-muted transition-colors hover:bg-interface/10 hover:text-paper" aria-label="Open settings" title="Open settings" @click="browser.runtime.openOptionsPage()">
            <span aria-hidden="true">⚙</span>
          </button>
        </div>
      </div>
    </header>
    <section class="flex-1 space-y-3 bg-cover bg-center px-5 py-5" :style="{ backgroundImage: `linear-gradient(var(--reading-backdrop), var(--reading-backdrop)), url(${stars})` }">
      <section aria-label="Known words" class="space-y-1 rounded-lg border border-interface/15 bg-ink-soft px-3 py-2">
        <p class="text-xs text-muted">Known words</p>
        <p class="text-xl font-semibold tabular-nums">{{ knownCount?.toLocaleString() ?? '—' }}</p>
        <p v-if="historyError" class="text-xs text-danger" role="alert">Could not read your known words.</p>
        <p v-if="desktopStatus === 'sent'" class="text-xs text-muted" role="status">History sent to Desktop</p>
        <div v-else-if="history && desktopStatus === 'unavailable'" class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span class="text-muted" role="status">Desktop unavailable</span>
          <button class="text-accent hover:underline" type="button" @click="sendHistory">Retry</button>
          <button class="text-accent hover:underline" type="button" @click="exportHistory">Export history</button>
        </div>
      </section>
      <button type="button" class="w-full rounded-lg border border-interface/20 px-3 py-2 text-sm font-medium hover:bg-interface/10" @click="openSidebar">Open Sidebar</button>
      <p v-if="sidebarError" class="text-xs text-danger" role="alert">{{ sidebarError }}</p>
      <button type="button" :disabled="parsing" class="w-full rounded-lg border border-interface/20 px-3 py-2 text-sm font-medium hover:bg-interface/10 disabled:opacity-50" @click="parsePage">{{ parsing ? 'Parsing…' : 'Parse Page' }}</button>
      <p v-if="parseError" class="text-xs text-danger" role="alert">{{ parseError }}</p>
      <p class="text-xs text-muted">Version {{ version }}</p>
    </section>
  </main>
</template>
