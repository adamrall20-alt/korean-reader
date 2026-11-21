<script setup lang="ts">
import { onMounted, ref } from 'vue';
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
onMounted(() => {
  void browser.runtime.sendMessage({ type: 'sync-desktop-history' }).catch(() => {});
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
      <button type="button" class="w-full rounded-lg border border-interface/20 px-3 py-2 text-sm font-medium hover:bg-interface/10" @click="openSidebar">Open Sidebar</button>
      <p v-if="sidebarError" class="text-xs text-danger" role="alert">{{ sidebarError }}</p>
      <button type="button" :disabled="parsing" class="w-full rounded-lg border border-interface/20 px-3 py-2 text-sm font-medium hover:bg-interface/10 disabled:opacity-50" @click="parsePage">{{ parsing ? 'Parsing…' : 'Parse Page' }}</button>
      <p v-if="parseError" class="text-xs text-danger" role="alert">{{ parseError }}</p>
      <p class="text-xs text-muted">Version {{ version }}</p>
    </section>
  </main>
</template>
