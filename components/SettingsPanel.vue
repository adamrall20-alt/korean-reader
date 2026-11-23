<script setup lang="ts">
import AnkiPanel from './AnkiPanel.vue';
import JapaneseDictionarySettings from './JapaneseDictionarySettings.vue';
import VocabularyManager from '@/components/VocabularyManager.vue';
import KnownWordsImport from '@/components/KnownWordsImport.vue';
import { onMounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import type { SettingsResponse } from '@/types/messages';
import type { ReaderLanguage } from '@/types/language';
import stars from '@/assets/stars.png';
import ReaderPageHeader from './ReaderPageHeader.vue';
import ReaderIcon from './ReaderIcon.vue';
import { requestPreferences } from '@/services/storage/preferences';
import {
  DEFAULT_SUBTITLE_APPEARANCE, MAX_SUBTITLE_SIZE, MIN_SUBTITLE_SIZE, SUBTITLE_FONTS,
  subtitleStyle, type InterfaceTheme, type PreferenceMessage,
} from '@/types/preferences';

const theme = ref<InterfaceTheme>('dark');
const appearance = ref({ ...DEFAULT_SUBTITLE_APPEARANCE });
const preferencesReady = ref(false);
const preferencesError = ref('');
const savingPreference = ref<'theme' | 'subtitles'>();
const themeMessage = ref('');
const appearanceMessage = ref('');

async function loadPreferences() {
  preferencesError.value = '';
  try {
    const result = await requestPreferences({ type: 'get-preferences' });
    if (!result.ok) throw new Error();
    theme.value = result.theme;
    appearance.value = result.appearance;
    preferencesReady.value = true;
  } catch {
    preferencesError.value = 'Could not load preferences.';
  }
}

async function savePreference(
  message: Exclude<PreferenceMessage, { type: 'get-preferences' }>,
) {
  if (!preferencesReady.value || savingPreference.value) return;
  const isTheme = message.type === 'set-interface-theme';
  const status = isTheme ? themeMessage : appearanceMessage;
  savingPreference.value = isTheme ? 'theme' : 'subtitles';
  status.value = '';
  try {
    const result = await requestPreferences(message);
    if (!result.ok) throw new Error();
    if (isTheme) theme.value = result.theme;
    else appearance.value = result.appearance;
    status.value = isTheme ? 'Theme saved.' : 'Subtitle appearance saved.';
  } catch {
    status.value = isTheme ? 'Could not save theme. Try again.' : 'Could not save subtitles. Try again.';
  } finally {
    savingPreference.value = undefined;
  }
}

onMounted(loadPreferences);

const krDictApiKey = ref('');
const settingsMessage = ref('');
const savingSettings = ref(false);
const clearingCache = ref(false);
const vocabularyRevision = ref(0);
const ankiLanguage = ref<ReaderLanguage>('ko');
const vocabularyLanguage = ref<ReaderLanguage>('ko');

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
    description: 'Choose a theme for Korean Reader.',
  },
  {
    id: 'dictionary',
    title: 'Dictionary',
    description: 'Korean dictionary settings and offline Japanese dictionary import.',
  },
  {
    id: 'anki',
    title: 'Anki',
    description: 'Connect AnkiConnect, choose your deck and note type, or import known words from a deck.',
  },
  {
    id: 'import-known',
    title: 'Known words transfer',
    description: 'Move known words between computers or import a list from Anki or Kimchi Reader.',
  },
  {
    id: 'appearance',
    title: 'Appearance',
    description: 'Customise the interactive subtitles on YouTube.',
  },
  {
    id: 'storage',
    title: 'Storage',
    description: 'Local vocabulary storage, JSON export and cache management.',
  },
] as const;
</script>

<template>
  <div class="min-h-screen bg-cover bg-center bg-fixed text-paper" :style="{ backgroundImage: `linear-gradient(var(--reading-backdrop), var(--reading-backdrop)), url(${stars})` }">
    <a href="#settings-main-content" class="skip-link">Skip to main content</a>
    <ReaderPageHeader page="settings" />

    <main id="settings-main-content" tabindex="-1" class="mx-auto grid max-w-5xl gap-6 px-6 py-8 md:grid-cols-[190px_1fr]">
      <nav aria-label="Settings sections" class="md:sticky md:top-6 md:self-start md:max-h-[calc(100dvh-3rem)] md:overflow-y-auto">
        <p class="mb-3 px-3 text-[11px] font-medium uppercase tracking-wider text-muted">
          Categories
        </p>
        <ul class="space-y-1">
          <li v-for="section in sections" :key="section.id">
            <a
              :href="`#${section.id}`"
              class="reader-icon-link flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-interface/5 hover:text-paper"
            >
              <ReaderIcon :name="section.id" class="size-4 shrink-0 text-accent" />
              {{ section.title }}
            </a>
          </li>
        </ul>
      </nav>

      <div>
        <div class="mb-6">
          <h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Manage subtitles, dictionary and saved vocabulary.
          </p>
        </div>

        <div class="space-y-4">
          <section
            v-for="section in sections"
            :id="section.id"
            :key="section.id"
            class="scroll-mt-6 rounded-2xl border border-interface/10 bg-ink-soft p-5"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 class="flex items-center gap-2.5 text-base font-medium">
                  <ReaderIcon :name="section.id" class="size-4 shrink-0 text-accent" />
                  {{ section.title }}
                </h2>
                <p class="mt-2 max-w-xl text-sm leading-6 text-muted">
                  {{ section.description }}
                </p>
              </div>
            </div>
            <form v-if="section.id === 'general'" class="mt-4 border-t border-interface/10 pt-4" @submit.prevent="savePreference({ type: 'set-interface-theme', theme })">
              <fieldset :disabled="!preferencesReady || !!savingPreference" class="flex flex-wrap gap-2">
                <legend class="mb-2 text-xs font-medium">Interface theme</legend>
                <label v-for="mode in (['dark', 'light'] as const)" :key="mode" class="flex items-center gap-2 rounded-lg border border-interface/15 px-3 py-2 text-sm capitalize">
                  <input
                    type="radio"
                    name="interface-theme"
                    :value="mode"
                    v-model="theme"
                    class="accent-accent"
                    @change="themeMessage = ''"
                  />
                  {{ mode }}
                </label>
              </fieldset>
              <button type="submit" :disabled="!preferencesReady || !!savingPreference" class="mt-3 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
                {{ savingPreference === 'theme' ? 'Saving…' : 'Save theme' }}
              </button>
              <p v-if="themeMessage" role="status" class="mt-2 text-xs text-muted">{{ themeMessage }}</p>
              <div v-if="preferencesError" role="alert" class="mt-2 text-xs text-danger">
                {{ preferencesError }} <button type="button" class="underline" @click="loadPreferences">Retry</button>
              </div>
            </form>
            <form v-else-if="section.id === 'appearance'" class="mt-4 border-t border-interface/10 pt-4" @submit.prevent="savePreference({ type: 'set-subtitle-appearance', appearance: { ...appearance } })">
              <fieldset :disabled="!preferencesReady || !!savingPreference" class="grid gap-4 sm:grid-cols-2" @input="appearanceMessage = ''">
                <label class="grid gap-1 text-sm">
                  Text size ({{ appearance.size }}%)
                  <input v-model.number="appearance.size" type="range" :min="MIN_SUBTITLE_SIZE" :max="MAX_SUBTITLE_SIZE" step="5" class="accent-accent" />
                </label>
                <label class="grid gap-1 text-sm">
                  Font
                  <select v-model="appearance.font" class="rounded-lg border border-interface/15 bg-ink px-2 py-1">
                    <option v-for="(font, id) in SUBTITLE_FONTS" :key="id" :value="id">{{ font.label }}</option>
                  </select>
                </label>
                <label class="flex items-center justify-between gap-2 text-sm">
                  Text colour
                  <input v-model="appearance.textColor" type="color" class="h-8 w-12 cursor-pointer" />
                </label>
                <label class="flex items-center justify-between gap-2 text-sm">
                  Unknown word underline colour
                  <input v-model="appearance.underlineColor" type="color" class="h-8 w-12 cursor-pointer" />
                </label>
              </fieldset>
              <div class="mt-4 rounded-lg bg-[#101010] px-3 py-4 text-center">
                <p class="mb-2 text-xs text-[#bdbdbd]">Subtitle preview</p>
                <p lang="ko" class="subtitle-preview" :style="subtitleStyle(appearance)">
                  오늘은 <span>한국어를</span> 공부해요.
                </p>
              </div>
              <div class="mt-4 flex flex-wrap items-center gap-3">
                <button type="submit" :disabled="!preferencesReady || !!savingPreference" class="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
                  {{ savingPreference === 'subtitles' ? 'Saving…' : 'Save subtitle appearance' }}
                </button>
                <button type="button" :disabled="!preferencesReady || !!savingPreference" class="rounded-lg border border-interface/15 px-3 py-2 text-xs disabled:opacity-50" @click="appearance = { ...DEFAULT_SUBTITLE_APPEARANCE }; appearanceMessage = ''">
                  Restore defaults
                </button>
              </div>
              <p v-if="appearanceMessage" role="status" class="mt-2 text-xs text-muted">{{ appearanceMessage }}</p>
            </form>
            <div v-else-if="section.id === 'dictionary'" class="mt-4 border-t border-interface/10 pt-4">
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
                  class="min-w-0 flex-1 rounded-lg border border-interface/15 bg-ink px-3 py-2 text-sm text-paper outline-none focus:border-accent"
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
                class="mt-3 rounded-lg border border-interface/15 px-3 py-2 text-xs font-medium text-paper disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="clearingCache"
                @click="clearDictionaryCache"
              >
                {{ clearingCache ? 'Clearing…' : 'Clear dictionary cache' }}
              </button>
              <JapaneseDictionarySettings :theme="theme" />
            </div>
            <div v-else-if="section.id === 'anki'" class="mt-4 space-y-3 border-t border-interface/10 pt-4">
              <label class="grid gap-1 text-xs">
                Anki profile
                <select v-model="ankiLanguage" class="w-fit rounded-lg border border-interface/15 bg-ink px-2 py-1">
                  <option value="ko">Korean</option>
                  <option value="ja">Japanese</option>
                </select>
              </label>
              <p v-if="ankiLanguage === 'ja'" class="text-xs text-muted">Choose a separate deck and use Japanese Reader or map fields from your own note type.</p>
              <AnkiPanel :key="ankiLanguage" :language="ankiLanguage" @imported="vocabularyRevision += 1" />
            </div>
            <div v-else-if="section.id === 'import-known' || section.id === 'storage'" class="mt-4 grid gap-3 border-t border-interface/10 pt-4">
              <label class="flex items-center gap-3 text-xs">
                {{ section.id === 'storage' ? 'Vocabulary language' : 'Transfer language' }}
                <select v-model="vocabularyLanguage" class="rounded-lg border border-interface/15 bg-ink px-2 py-1">
                  <option value="ko">Korean</option><option value="ja">Japanese</option>
                </select>
              </label>
              <KnownWordsImport v-if="section.id === 'import-known'" :key="vocabularyLanguage" :language="vocabularyLanguage" @imported="vocabularyRevision += 1" />
              <details v-else><summary class="cursor-pointer text-sm font-medium">Known words and vocabulary</summary>
                <VocabularyManager :key="vocabularyLanguage + vocabularyRevision" :language="vocabularyLanguage" />
              </details>
            </div>
          </section>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.subtitle-preview {
  color: var(--kr-subtitle-color);
  font-family: var(--kr-subtitle-font);
  font-size: calc(1.5rem * var(--kr-subtitle-scale));
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.subtitle-preview span {
  text-decoration: underline var(--kr-subtitle-underline) 0.08em;
  text-underline-offset: 0.18em;
}
</style>
