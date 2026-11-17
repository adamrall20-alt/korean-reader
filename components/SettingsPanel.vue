<script setup lang="ts">
import VocabularyManager from '@/components/VocabularyManager.vue';
import AnkiPanel from '@/components/AnkiPanel.vue';
import { onMounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import type { SettingsResponse } from '@/types/messages';
import stars from '@/assets/stars.png';
import logo from '@/assets/penguin.png';

const krDictApiKey = ref('');
const settingsMessage = ref('');
const savingSettings = ref(false);
const clearingCache = ref(false);
const vocabularyRevision = ref(0);

onMounted(async () => {
  try {
    const response = (await browser.runtime.sendMessage({
      type: 'get-settings',
    })) as SettingsResponse | undefined;

    if (response?.ok) {
      krDictApiKey.value = response.krDictApiKey ?? '';
    } else {
      settingsMessage.value = response?.error ?? 'Could not load dictionary settings.';
    }
  } catch (error: unknown) {
    settingsMessage.value =
      error instanceof Error ? error.message : 'Could not load dictionary settings.';
  }
});

const saveKrDictApiKey = async () => {
  savingSettings.value = true;
  settingsMessage.value = '';

  try {
    const response = (await browser.runtime.sendMessage({
      type: 'set-krdict-api-key',
      apiKey: krDictApiKey.value,
    })) as SettingsResponse | undefined;

    settingsMessage.value = response?.ok
      ? 'KRDict API key saved locally.'
      : (response?.error ?? 'Could not save the KRDict API key.');
  } catch (error: unknown) {
    settingsMessage.value =
      error instanceof Error ? error.message : 'Could not save the KRDict API key.';
  } finally {
    savingSettings.value = false;
  }
};

const clearDictionaryCache = async () => {
  clearingCache.value = true;
  settingsMessage.value = '';

  try {
    const response = (await browser.runtime.sendMessage({
      type: 'clear-dictionary-cache',
    })) as SettingsResponse | undefined;
    settingsMessage.value = response?.ok
      ? 'Dictionary cache cleared.'
      : (response?.error ?? 'Could not clear the dictionary cache.');
  } catch (error: unknown) {
    settingsMessage.value =
      error instanceof Error ? error.message : 'Could not clear the dictionary cache.';
  } finally {
    clearingCache.value = false;
  }
};

const sections = [
  {
    id: 'general',
    title: 'General',
    description: 'Extension behaviour, startup preferences and interface language.',
  },
  {
    id: 'dictionary',
    title: 'Dictionary',
    description: 'KRDict API key, lookup preferences and local dictionary cache controls.',
  },
  {
    id: 'anki',
    title: 'Anki',
    description: 'AnkiConnect connection, default deck and Kimchi Sentence Mining field mapping.',
  },
  {
    id: 'appearance',
    title: 'Appearance',
    description: 'Subtitle font size, overlay position and light or dark appearance.',
  },
  {
    id: 'storage',
    title: 'Storage',
    description: 'Local vocabulary storage, JSON export and cache management.',
  },
] as const;
</script>

<template>
  <div class="min-h-screen bg-cover bg-center bg-fixed text-paper" :style="{ backgroundImage: `linear-gradient(rgba(17,17,17,.58), rgba(17,17,17,.58)), url(${stars})` }">
    <header class="relative z-10 border-b border-white/10 bg-ink">
      <div class="mx-auto flex max-w-5xl items-center gap-3 px-6 py-4">
        <img :src="logo" alt="" class="size-9 rounded-xl object-cover" />
        <div>
          <p class="text-sm font-semibold tracking-tight">Korean Reader</p>
          <p class="text-xs text-muted">Settings</p>
        </div>
      </div>
    </header>

    <main class="mx-auto grid max-w-5xl gap-6 px-6 py-8 md:grid-cols-[190px_1fr]">
      <nav aria-label="Settings sections">
        <p class="mb-3 px-3 text-[11px] font-medium uppercase tracking-wider text-muted">
          Categories
        </p>
        <ul class="space-y-1">
          <li v-for="section in sections" :key="section.id">
            <a
              :href="`#${section.id}`"
              class="block rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-paper"
            >
              {{ section.title }}
            </a>
          </li>
        </ul>
      </nav>

      <div>
        <div class="mb-6">
          <h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Manage dictionary, Anki and locally saved vocabulary settings.
          </p>
        </div>

        <div class="space-y-4">
          <section
            v-for="section in sections"
            :id="section.id"
            :key="section.id"
            class="scroll-mt-6 rounded-2xl border border-white/10 bg-ink-soft p-5"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 class="text-base font-medium">{{ section.title }}</h2>
                <p class="mt-2 max-w-xl text-sm leading-6 text-muted">
                  {{ section.description }}
                </p>
              </div>
            </div>
            <div v-if="section.id === 'dictionary'" class="mt-4 border-t border-white/10 pt-4">
              <label for="krdict-api-key" class="text-xs font-medium text-paper">
                KRDict API key
              </label>
              <p class="mt-1 text-xs leading-5 text-muted">
                Stored locally and used only by the background service worker for dictionary
                requests.
              </p>
              <div class="mt-3 flex gap-2">
                <input
                  id="krdict-api-key"
                  v-model="krDictApiKey"
                  type="password"
                  autocomplete="off"
                  class="min-w-0 flex-1 rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-paper outline-none focus:border-accent"
                  placeholder="Enter your 32-character API key"
                />
                <button
                  type="button"
                  class="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="savingSettings"
                  @click="saveKrDictApiKey"
                >
                  {{ savingSettings ? 'Saving…' : 'Save' }}
                </button>
              </div>
              <p v-if="settingsMessage" class="mt-2 text-xs text-muted" role="status">
                {{ settingsMessage }}
              </p>
              <button
                type="button"
                class="mt-3 rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-paper disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="clearingCache"
                @click="clearDictionaryCache"
              >
                {{ clearingCache ? 'Clearing…' : 'Clear dictionary cache' }}
              </button>
            </div>
            <AnkiPanel v-else-if="section.id === 'anki'" class="mt-4 border-t border-white/10 pt-4" @imported="vocabularyRevision += 1" />
            <details v-else-if="section.id === 'storage'" class="mt-4 border-t border-white/10 pt-4"><summary class="cursor-pointer text-sm font-medium">Known words and vocabulary</summary><VocabularyManager :key="vocabularyRevision" /></details>
            <p v-else class="mt-4 border-t border-white/10 pt-4 text-xs text-muted">
              This section is a placeholder and does not save any settings yet.
            </p>
          </section>
        </div>
      </div>
    </main>
  </div>
</template>
