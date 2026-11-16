<script setup lang="ts">
import AnkiPanel from '@/components/AnkiPanel.vue';
import { computed, onMounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import type { PingResponse } from '@/types/messages';
import type { VocabularyContext, VocabularyEntry, VocabularyMessage, VocabularyResponse } from '@/types/vocabulary';

type ConnectionState = 'checking' | 'connected' | 'unavailable';

const connection = ref<ConnectionState>('checking');
const version = ref('');

const openSettings = () => {
  void browser.runtime.openOptionsPage();
};

const connectionLabel = computed(() => {
  if (connection.value === 'connected') return 'Connected';
  if (connection.value === 'checking') return 'Checking…';
  return 'Unavailable';
});

const connectionClass = computed(() => {
  if (connection.value === 'connected') return 'bg-accent/10 text-accent';
  if (connection.value === 'checking') return 'bg-white/5 text-muted';
  return 'bg-red-500/10 text-red-300';
});

const entries = ref<VocabularyEntry[]>([]);
const selected = ref<string[]>([]);
const query = ref('');
const filter = ref('all');
const newestFirst = ref(true);
const busy = ref(false);
const vocabularyError = ref('');
const editing = ref<string>();
const draftDefinitions = ref('');
const pendingDeletion = ref<string>();

const visibleEntries = computed(() => {
  const term = query.value.trim().normalize('NFC').toLowerCase();
  return entries.value
    .filter((entry) => (filter.value === 'all' || entry.status === filter.value) &&
      [entry.headword, entry.originalForm, ...entry.definitions, ...entry.koreanDefinitions,
        ...(entry.machineDefinitions ?? []), ...entry.contexts.map((context) => context.sentence)]
        .some((text) => text.toLowerCase().includes(term)))
    .sort((a, b) => newestFirst.value
      ? b.createdAt.localeCompare(a.createdAt)
      : a.createdAt.localeCompare(b.createdAt));
});

async function updateVocabulary(message: VocabularyMessage): Promise<boolean> {
  if (busy.value) return false;
  busy.value = true;
  vocabularyError.value = '';
  try {
    const response: VocabularyResponse | undefined = await browser.runtime.sendMessage(message);
    if (!response?.ok) {
      throw new Error(response?.error ?? 'Could not access saved vocabulary.');
    }
    entries.value = response.entries ?? [];
    const available = new Set(entries.value.map((entry) => entry.headword));
    selected.value = selected.value.filter((headword) => available.has(headword));
    return true;
  } catch (error) {
    vocabularyError.value = error instanceof Error ? error.message : 'Could not access saved vocabulary.';
    return false;
  } finally {
    busy.value = false;
  }
}

function beginEdit(entry: VocabularyEntry) {
  pendingDeletion.value = undefined;
  editing.value = entry.headword;
  draftDefinitions.value = entry.definitions.join('\n');
}

async function saveDefinitions(headword: string) {
  const definitions = draftDefinitions.value.split('\n').map((line) => line.trim()).filter(Boolean);
  if (await updateVocabulary({ type: 'edit-vocabulary', headword, definitions })) {
    editing.value = undefined;
  }
}

async function deleteWord(headword: string) {
  if (await updateVocabulary({ type: 'delete-vocabulary', headword })) {
    pendingDeletion.value = undefined;
    if (editing.value === headword) editing.value = undefined;
  }
}

function sourceLink(context: VocabularyContext): string {
  return context.timestamp === undefined
    ? context.sourceUrl
    : `${context.sourceUrl}&t=${Math.floor(context.timestamp)}s`;
}

function exportVocabulary() {
  const file = new Blob([JSON.stringify(entries.value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'korean-reader-vocabulary.json';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

onMounted(() => void updateVocabulary({ type: 'list-vocabulary' }));

onMounted(async () => {
  try {
    const response = (await browser.runtime.sendMessage({ type: 'ping' })) as
      | PingResponse
      | undefined;

    if (response?.ok) {
      connection.value = 'connected';
      version.value = response.version;
      return;
    }

    connection.value = 'unavailable';
  } catch {
    connection.value = 'unavailable';
  }
});
</script>

<template>
  <main class="flex min-h-[480px] flex-col bg-ink text-paper">
    <header class="border-b border-white/10 px-5 py-4">
      <div class="flex items-center gap-3">
        <div
          class="grid size-9 place-items-center rounded-xl bg-accent text-sm font-bold tracking-tight text-white"
          aria-hidden="true"
        >
          KR
        </div>
        <div class="min-w-0">
          <h1 class="truncate text-base font-semibold tracking-tight">Korean Reader</h1>
          <p class="truncate text-xs text-muted">Vocabulary mining for YouTube</p>
        </div>
        <button
          type="button"
          class="ml-auto grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 text-muted transition-colors hover:bg-white/10 hover:text-paper"
          aria-label="Open settings"
          title="Open settings"
          @click="openSettings"
        >
          <span aria-hidden="true">⚙</span>
        </button>
      </div>
    </header>

    <section class="space-y-3 px-5 py-5">
      <div class="rounded-2xl border border-white/10 bg-ink-soft p-4">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-sm font-medium">Extension status</h2>
          <span
            class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            :class="connectionClass"
            data-testid="connection-status"
            aria-live="polite"
          >
            <span class="size-1.5 rounded-full bg-current" aria-hidden="true" />
            {{ connectionLabel }}
          </span>
        </div>
        <p class="mt-2 text-xs leading-5 text-muted">
          {{
            connection === 'connected'
              ? 'The background service worker is responding.'
              : connection === 'checking'
                ? 'Contacting the background service worker…'
                : 'The background service worker did not respond. Reload the extension.'
          }}
        </p>
      </div>

      <section aria-labelledby="vocabulary-heading" class="space-y-3">
        <div class="flex items-center justify-between gap-2">
          <h2 id="vocabulary-heading" class="font-semibold">Vocabulary
            <span class="ml-1 text-xs font-normal text-muted">{{ entries.length }} words</span>
          </h2>
          <button
            type="button"
            class="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs disabled:opacity-50"
            :disabled="busy || !entries.length"
            @click="exportVocabulary"
          >Export JSON</button>
        </div>
        <input
          v-model="query"
          type="search"
          aria-label="Search vocabulary"
          placeholder="Search words or sentences"
          class="w-full rounded-lg border border-white/15 bg-ink-soft px-3 py-2 text-sm"
        />
        <div class="flex gap-2">
          <select v-model="filter" aria-label="Filter by status" class="flex-1 rounded-lg bg-ink-soft p-2 text-xs">
            <option value="all">All statuses</option>
            <option value="known">Known</option>
            <option value="unknown">Unknown</option>
          </select>
          <button type="button" class="rounded-lg bg-ink-soft px-3 text-xs" @click="newestFirst = !newestFirst">
            {{ newestFirst ? 'Newest first' : 'Oldest first' }}
          </button>
        </div>
        <div v-if="vocabularyError" class="flex items-start gap-2 text-xs text-red-300">
          <p role="alert">{{ vocabularyError }}</p>
          <button type="button" class="ml-auto underline" @click="updateVocabulary({ type: 'list-vocabulary' })">Reload</button>
        </div>
        <p v-if="!visibleEntries.length && !vocabularyError" class="py-4 text-sm text-muted" role="status">
          {{ busy ? 'Loading vocabulary…' : entries.length ? 'No matching words.' : 'Mine a word from a YouTube subtitle to save it here.' }}
        </p>
        <div v-if="visibleEntries.length" class="flex items-center justify-between text-xs text-muted">
          <button type="button" class="underline" @click="selected = [...new Set([...selected, ...visibleEntries.map((entry) => entry.headword)])]">Select visible</button>
          <button v-if="selected.length" type="button" class="underline" @click="selected = []">Clear {{ selected.length }} selected</button>
        </div>
        <ul v-if="visibleEntries.length" class="space-y-2">
          <li v-for="entry in visibleEntries" :key="entry.headword" class="space-y-2 rounded-xl border border-white/10 bg-ink-soft p-3">
            <div class="flex items-center gap-2">
              <input
                v-model="selected"
                type="checkbox"
                :value="entry.headword"
                :aria-label="`Select ${entry.headword} for Anki`"
                class="accent-accent"
              />
              <h3 lang="ko" class="min-w-0 flex-1 break-words font-semibold">{{ entry.headword }}</h3>
              <button
                type="button"
                role="switch"
                :aria-checked="entry.status === 'known'"
                :aria-label="`Known status for ${entry.headword}`"
                :disabled="busy"
                class="rounded-full border border-white/15 px-2.5 py-1 text-xs"
                :class="entry.status === 'known' ? 'text-accent' : 'text-muted'"
                @click="updateVocabulary({ type: 'set-vocabulary-status', headword: entry.headword, status: entry.status === 'known' ? 'unknown' : 'known' })"
              >{{ entry.status === 'known' ? 'Known' : 'Unknown' }}</button>
            </div>
            <p v-if="entry.originalForm !== entry.headword" class="text-xs text-muted" lang="ko">{{ entry.originalForm }}</p>
            <form v-if="editing === entry.headword" class="space-y-2" @submit.prevent="saveDefinitions(entry.headword)">
              <label class="block text-xs">
                English definitions, one per line
                <textarea v-model="draftDefinitions" rows="3" class="mt-1 w-full rounded-lg border border-white/15 bg-ink px-2 py-1 text-sm" />
              </label>
              <button type="submit" :disabled="busy" class="mr-3 text-xs text-accent">Save definitions</button>
              <button type="button" :disabled="busy" class="text-xs text-muted" @click="editing = undefined">Cancel</button>
            </form>
            <template v-else>
              <p v-if="!entry.definitions.length && entry.machineDefinitions?.length" class="text-xs text-muted">Machine translation</p>
              <ul class="space-y-1 text-sm">
                <li v-for="(definition, index) in entry.definitions.length ? entry.definitions : entry.machineDefinitions?.length ? entry.machineDefinitions : entry.koreanDefinitions" :key="index">
                  {{ definition }}
                </li>
              </ul>
            </template>
            <details class="text-xs">
              <summary class="cursor-pointer text-muted">{{ entry.contexts.length }} {{ entry.contexts.length === 1 ? 'sentence' : 'sentences' }}</summary>
              <ul class="space-y-2 pt-2">
                <li v-for="(context, index) in entry.contexts" :key="index">
                  <p class="whitespace-pre-line break-words" lang="ko">{{ context.sentence }}</p>
                  <a :href="sourceLink(context)" target="_blank" rel="noreferrer" class="text-accent underline">
                    {{ context.sourceTitle || 'YouTube video' }}<template v-if="context.timestamp !== undefined">
                      · {{ Math.floor(context.timestamp / 60) }}:{{ String(Math.floor(context.timestamp % 60)).padStart(2, '0') }}
                    </template>
                  </a>
                </li>
              </ul>
            </details>
            <div class="flex items-center gap-3 border-t border-white/10 pt-2 text-xs">
              <time :datetime="entry.createdAt" class="mr-auto text-muted">{{ new Date(entry.createdAt).toLocaleDateString() }}</time>
              <span v-if="entry.ankiSyncedAt" class="text-muted" :title="`Last Anki sync ${new Date(entry.ankiSyncedAt).toLocaleString()}`">In Anki</span>
              <template v-if="pendingDeletion === entry.headword">
                <button type="button" :disabled="busy" class="text-red-300" @click="deleteWord(entry.headword)">Delete word</button>
                <button type="button" :disabled="busy" class="text-muted" @click="pendingDeletion = undefined">Cancel</button>
              </template>
              <template v-else>
                <button v-if="editing !== entry.headword" type="button" :disabled="busy" class="text-accent" @click="beginEdit(entry)">Edit</button>
                <button type="button" :disabled="busy" class="text-muted" @click="pendingDeletion = entry.headword">Delete</button>
              </template>
            </div>
          </li>
        </ul>
        <AnkiPanel :headwords="selected" class="border-t border-white/10 pt-3" @synced="updateVocabulary({ type: 'list-vocabulary' })" />
      </section>
    </section>

    <footer class="mt-auto border-t border-white/10 px-5 py-3">
      <p class="text-[11px] text-muted">
        v{{ version || '0.1.0' }}
      </p>
    </footer>
  </main>
</template>
