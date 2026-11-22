<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import logo from '@/assets/New logo update.png';
import stars from '@/assets/stars.png';
import {
  buildSourceLink,
  type DesktopCardDetail,
  type DesktopCardSummary,
  type DesktopLibraryStats,
  type ImportResult,
  type ReviewQueueSummary,
} from '../shared/api';
import ReviewView from './ReviewView.vue';
import SettingsView from './SettingsView.vue';
import PracticeView from './PracticeView.vue';
import StatsView from './StatsView.vue';
import ProfileView from './ProfileView.vue';

type Tab = 'review' | 'practice' | 'library' | 'stats' | 'profile' | 'settings';
const activeTab = ref<Tab>('library');
const reviewViewRef = ref<InstanceType<typeof ReviewView> | null>(null);
const reviewDueCount = ref(0);

const cards = ref<DesktopCardSummary[]>([]);
const selectedCardId = ref<string | null>(null);
const selectedCard = ref<DesktopCardDetail | null>(null);
const stats = ref<DesktopLibraryStats>({
  totalCards: 0,
  totalContexts: 0,
  newCards: 0,
  dueCards: 0,
  mediaAssets: 0,
});

const searchQuery = ref('');
const loading = ref(false);
const importing = ref<'json' | 'apkg' | null>(null);
const loadError = ref('');
const importNotice = ref('');
const importError = ref('');
const linkStatus = ref('');
const playingContextId = ref<string | null>(null);
const theme = ref<'dark' | 'light'>('dark');

let searchTimer: ReturnType<typeof setTimeout> | null = null;
const audioElements = new Map<string, HTMLAudioElement>();

const hasCards = computed(() => stats.value.totalCards > 0);

function setAudioRef(contextId: string, el: unknown) {
  if (el instanceof HTMLAudioElement) {
    audioElements.set(contextId, el);
  } else {
    audioElements.delete(contextId);
  }
}

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
  if (theme.value === 'light') {
    document.documentElement.dataset.theme = 'light';
  } else {
    delete document.documentElement.dataset.theme;
  }
}

function splitHighlight(sentence: string, originalForm: string) {
  const idx = originalForm ? sentence.indexOf(originalForm) : -1;
  if (idx < 0) {
    return { before: sentence, match: '', after: '' };
  }
  return {
    before: sentence.slice(0, idx),
    match: originalForm,
    after: sentence.slice(idx + originalForm.length),
  };
}

async function refreshLibrary(preserveSelection = true) {
  const api = window.koreanReaderDesktop;
  if (!api) {
    loadError.value = 'Desktop bridge unavailable. Launch this window through Electron.';
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    const [nextCards, nextStats, nextQueue] = await Promise.all([
      api.listCards(searchQuery.value),
      api.getLibraryStats(),
      api.getReviewQueue ? api.getReviewQueue() : Promise.resolve(null),
    ]);
    cards.value = nextCards;
    stats.value = nextStats;
    if (nextQueue) {
      reviewDueCount.value = nextQueue.totalDue;
    }
    if (activeTab.value === 'review') {
      void reviewViewRef.value?.refresh();
    }

    if (nextCards.length === 0) {
      selectedCardId.value = null;
      selectedCard.value = null;
    } else if (
      preserveSelection &&
      selectedCardId.value &&
      nextCards.some((card) => card.id === selectedCardId.value)
    ) {
      await loadCardDetail(selectedCardId.value);
    } else {
      await loadCardDetail(nextCards[0]!.id);
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Failed to load local library.';
  } finally {
    loading.value = false;
  }
}

async function loadCardDetail(cardId: string) {
  const api = window.koreanReaderDesktop;
  if (!api) return;
  selectedCardId.value = cardId;
  linkStatus.value = '';
  try {
    selectedCard.value = await api.getCardDetail(cardId);
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Failed to load card details.';
  }
}

async function importFile(format: 'json' | 'apkg') {
  const api = window.koreanReaderDesktop;
  if (!api || importing.value) return;

  importing.value = format;
  importNotice.value = '';
  importError.value = '';
  try {
    const result: ImportResult = await (format === 'apkg' ? api.importAnkiPackage() : api.importVocabularyFile());
    if (result.cancelled) {
      return;
    }
    if (!result.ok || !result.summary) {
      importError.value = result.error ?? 'Could not import vocabulary file.';
      return;
    }
    const s = result.summary;
    const parts = [
      `${s.cardsAdded} added`,
      `${s.cardsUpdated} updated`,
      `${s.contextsAdded} contexts`,
    ];
    if (s.skippedKnownOnly > 0) {
      parts.push(`${s.skippedKnownOnly} known-only skipped`);
    }
    if (s.skippedInvalid) parts.push(`${s.skippedInvalid} unsupported entries skipped`);
    if (s.missingMedia) parts.push(`${s.missingMedia} missing or unsupported attachments`);
    if (s.mediaSaved > 0) {
      parts.push(`${s.mediaSaved} media files saved`);
    }
    importNotice.value = `Imported ${result.fileName ?? 'vocabulary'}: ${parts.join(' · ')}.`;
    await refreshLibrary(false);
  } catch (error) {
    importError.value = error instanceof Error ? error.message : 'Import failed.';
  } finally {
    importing.value = null;
  }
}

async function playContextAudio(contextId: string) {
  const el = audioElements.get(contextId);
  if (!el) return;
  try {
    el.currentTime = 0;
    playingContextId.value = contextId;
    await el.play();
  } catch {
    playingContextId.value = null;
  }
}

function onAudioEnded(contextId: string) {
  if (playingContextId.value === contextId) {
    playingContextId.value = null;
  }
}

async function openSource(sourceUrl: string, timestamp?: number) {
  const api = window.koreanReaderDesktop;
  if (!api || !sourceUrl) return;
  const target = buildSourceLink(sourceUrl, timestamp);
  const result = await api.openExternalUrl(target);
  linkStatus.value = result.ok ? 'Opened in browser' : (result.error ?? 'Could not open link');
}

async function removeSelectedCard() {
  const api = window.koreanReaderDesktop;
  if (!api || !selectedCard.value) return;
  const result = await api.deleteCard(selectedCard.value.id);
  if (result.ok) {
    await refreshLibrary(false);
  } else {
    loadError.value = result.error ?? 'Could not delete card.';
  }
}

watch(searchQuery, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    void refreshLibrary(true);
  }, 180);
});

let unsubscribeWifiSync: (() => void) | undefined;
let unsubscribeLibraryUpdates: (() => void) | null = null;

onMounted(() => {
  void refreshLibrary(false);
  if (window.koreanReaderDesktop?.onLibraryUpdated) {
    unsubscribeWifiSync = window.koreanReaderDesktop.onWifiSyncStatus((message) => {
      if (message === 'Sync complete.') void refreshLibrary(true);
    });
    unsubscribeLibraryUpdates = window.koreanReaderDesktop.onLibraryUpdated((summary) => {
      const parts: string[] = [];
      if (summary.cardsAdded > 0) parts.push(`${summary.cardsAdded} added`);
      if (summary.cardsUpdated > 0) parts.push(`${summary.cardsUpdated} updated`);
      if (summary.contextsAdded > 0) parts.push(`${summary.contextsAdded} contexts`);
      importNotice.value =
        parts.length > 0
          ? `Auto-imported from Chrome extension: ${parts.join(' · ')}.`
          : 'Synced with Chrome extension.';
      void refreshLibrary(true);
    });
  }
});

function handleQueueChanged(queue: ReviewQueueSummary) {
  reviewDueCount.value = queue.totalDue;
}

function switchTab(tab: Tab) {
  activeTab.value = tab;
  if (tab === 'library') {
    void refreshLibrary(true);
  }
}

async function handleSettingsSaved() {
  const api = window.koreanReaderDesktop;
  if (api?.getReviewQueue) {
    const nextQueue = await api.getReviewQueue();
    reviewDueCount.value = nextQueue.totalDue;
  }
}

onBeforeUnmount(() => {
  unsubscribeWifiSync?.();
  unsubscribeLibraryUpdates?.();
  unsubscribeLibraryUpdates = null;
});
</script>

<template>
  <div class="flex min-h-screen flex-col bg-ink text-paper">
    <a href="#desktop-main-content" class="skip-link">Skip to main content</a>
    <header class="sticky top-0 z-10 border-b border-interface/10 bg-ink px-6 py-3.5">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
        <img :src="logo" alt="" class="size-9 shrink-0 object-contain" />
        <div class="min-w-0">
          <h1 class="truncate text-base font-semibold tracking-tight text-paper">Korean Reader</h1>
          <p class="text-xs text-muted">Desktop</p>
        </div>

        <nav aria-label="Main sections" class="ml-2 flex items-center rounded-lg border border-interface/15 bg-ink-soft p-0.5 text-xs max-[940px]:order-last max-[940px]:ml-0">
          <button
            type="button"
            :aria-current="activeTab === 'review' ? 'page' : undefined"
            class="flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors"
            :class="activeTab === 'review' ? 'bg-accent text-white' : 'text-muted hover:text-paper'"
            @click="switchTab('review')"
          >
            <span>Review</span>
            <span
              v-if="reviewDueCount > 0"
              class="rounded-full px-1.5 py-0.2 text-[10px] font-semibold"
              :class="activeTab === 'review' ? 'bg-white/20 text-white' : 'bg-accent/20 text-accent'"
            >
              {{ reviewDueCount }}
            </span>
          </button>
          <button v-for="tab in [
              { id: 'practice', label: 'Practice' },
              { id: 'library', label: `Library (${stats.totalCards})` },
              { id: 'stats', label: 'Stats' },
              { id: 'profile', label: 'Profile' },
              { id: 'settings', label: 'Settings' },
            ] as const"
            :key="tab.id" type="button"
            :aria-current="activeTab === tab.id ? 'page' : undefined"
            class="rounded-md px-3 py-1 font-medium transition-colors"
            :class="activeTab === tab.id ? 'bg-accent text-white' : 'text-muted hover:text-paper'"
            @click="switchTab(tab.id)">{{ tab.label }}</button>
        </nav>

        <div class="ml-auto flex items-center gap-2.5">
          <button
            type="button"
            class="rounded-lg border border-interface/15 bg-ink-soft px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-ink-lift hover:text-paper"
            :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
            :aria-pressed="theme === 'light'"
            @click="toggleTheme"
          >
            {{ theme === 'dark' ? 'Light' : 'Dark' }}
          </button>
          <button
            type="button"
            :disabled="!!importing"
            class="rounded-lg border border-interface/15 bg-ink-soft px-3 py-1.5 text-xs font-medium text-paper transition-colors hover:bg-ink-lift disabled:opacity-50"
            @click="importFile('apkg')"
          >
            {{ importing === 'apkg' ? 'Importing Anki…' : 'Import Anki .apkg' }}
          </button>
          <button
            type="button"
            :disabled="!!importing"
            class="rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            @click="importFile('json')"
          >
            {{ importing === 'json' ? 'Importing…' : 'Import JSON' }}
          </button>
        </div>
      </div>
    </header>

    <main
      id="desktop-main-content"
      tabindex="-1"
      class="flex-1 bg-cover bg-fixed bg-center px-6 py-5"
      :style="{
        backgroundImage: `linear-gradient(var(--reading-backdrop), var(--reading-backdrop)), url(${stars})`,
      }"
    >
      <div class="mx-auto flex max-w-6xl flex-col gap-4">
        <div
          v-if="loadError"
          role="alert"
          class="rounded-xl border border-danger/30 bg-ink-soft px-4 py-3 text-sm text-danger"
        >
          {{ loadError }}
        </div>

        <div
          v-if="importError"
          role="alert"
          class="rounded-xl border border-danger/30 bg-ink-soft px-4 py-3 text-sm text-danger"
        >
          {{ importError }}
        </div>

        <div
          v-if="importNotice"
          role="status"
          class="rounded-xl border border-accent/40 bg-ink-soft px-4 py-3 text-sm text-paper"
        >
          <span class="font-semibold text-accent">✓</span> {{ importNotice }}
        </div>

        <ReviewView
          v-if="activeTab === 'review'"
          ref="reviewViewRef"
          @open-library="switchTab('library')"
          @open-settings="switchTab('settings')"
          @queue-changed="handleQueueChanged"
        />

        <PracticeView v-else-if="activeTab === 'practice'" @open-library="switchTab('library')" />
        <StatsView v-else-if="activeTab === 'stats'" />
        <ProfileView v-else-if="activeTab === 'profile'" />
        <SettingsView
          v-else-if="activeTab === 'settings'"
          @settings-saved="handleSettingsSaved"
        />

        <template v-else>
        <section
          aria-label="Library statistics"
          class="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <div class="rounded-xl border border-interface/10 bg-ink-soft px-4 py-3">
            <p class="text-xs text-muted">Study cards</p>
            <p class="mt-1 text-xl font-semibold text-paper">{{ stats.totalCards.toLocaleString() }}</p>
          </div>
          <div class="rounded-xl border border-interface/10 bg-ink-soft px-4 py-3">
            <p class="text-xs text-muted">New cards</p>
            <p class="mt-1 text-xl font-semibold text-accent">{{ stats.newCards.toLocaleString() }}</p>
          </div>
          <div class="rounded-xl border border-interface/10 bg-ink-soft px-4 py-3">
            <p class="text-xs text-muted">Mined contexts</p>
            <p class="mt-1 text-xl font-semibold text-paper">{{ stats.totalContexts.toLocaleString() }}</p>
          </div>
          <div class="rounded-xl border border-interface/10 bg-ink-soft px-4 py-3">
            <p class="text-xs text-muted">Local media</p>
            <p class="mt-1 text-xl font-semibold text-paper">{{ stats.mediaAssets.toLocaleString() }}</p>
          </div>
        </section>

        <section
          v-if="!hasCards && !loading && !loadError"
          class="flex flex-col items-center justify-center rounded-2xl border border-interface/10 bg-ink-soft px-6 py-14 text-center"
        >
          <img :src="logo" alt="" class="mb-4 size-16 object-contain" />
          <h2 class="text-lg font-semibold text-paper">No study cards imported yet</h2>
          <p class="mt-2 max-w-md text-sm text-muted">
            Export <code class="rounded bg-ink-lift px-1.5 py-0.5 text-xs text-paper">korean-reader-vocabulary.json</code>
            from the Chrome extension Settings page, then import it here. Known-only words without mined sentences are skipped automatically.
          </p>
          <button
            type="button"
            :disabled="!!importing"
            class="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            @click="importFile('json')"
          >
            {{ importing ? 'Importing…' : 'Import Vocabulary JSON' }}
          </button>
        </section>

        <section
          v-else-if="hasCards"
          class="grid gap-4 lg:grid-cols-[340px_1fr]"
        >
          <aside class="flex flex-col gap-3 rounded-2xl border border-interface/10 bg-ink-soft p-4">
            <input
              v-model="searchQuery"
              type="search"
              placeholder="Search headword, definition, or sentence…"
              aria-label="Search study cards"
              class="w-full rounded-lg border border-interface/15 bg-ink px-3 py-2 text-sm text-paper placeholder:text-muted"
            />

            <p v-if="cards.length === 0" class="py-8 text-center text-xs text-muted">
              No cards match "{{ searchQuery }}".
            </p>

            <ul v-else aria-label="Study card list" class="flex max-h-[560px] flex-col gap-1.5 overflow-y-auto pr-1">
              <li v-for="card in cards" :key="card.id">
                <button
                  type="button"
                  :aria-current="card.id === selectedCardId ? 'true' : undefined"
                  class="w-full rounded-xl border px-3.5 py-2.5 text-left transition-colors"
                  :class="
                    card.id === selectedCardId
                      ? 'border-accent/60 bg-ink-lift'
                      : 'border-transparent bg-ink/40 hover:border-interface/15 hover:bg-ink-lift/60'
                  "
                  @click="loadCardDetail(card.id)"
                >
                  <div class="flex items-baseline justify-between gap-2">
                    <span lang="ko" class="truncate text-base font-semibold text-paper">{{ card.headword }}</span>
                    <span v-if="card.frequencyRank" class="shrink-0 text-xs font-medium text-accent">
                      #{{ card.frequencyRank.toLocaleString() }}
                    </span>
                  </div>
                  <p class="mt-0.5 truncate text-xs text-muted">
                    {{ card.definitions[0] ?? card.koreanDefinitions[0] ?? card.primarySentence }}
                  </p>
                  <div class="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
                    <span v-if="card.partOfSpeech">{{ card.partOfSpeech }}</span>
                    <span class="ml-auto">{{ card.contextCount }} {{ card.contextCount === 1 ? 'context' : 'contexts' }}</span>
                  </div>
                </button>
              </li>
            </ul>
          </aside>

          <article
            v-if="selectedCard"
            aria-label="Selected study card"
            class="flex flex-col gap-5 rounded-2xl border border-interface/10 bg-ink-soft p-6"
          >
            <div class="flex flex-wrap items-start justify-between gap-3 border-b border-interface/10 pb-4">
              <div>
                <div class="flex flex-wrap items-baseline gap-2.5">
                  <h2 lang="ko" class="text-3xl font-bold tracking-tight text-paper">{{ selectedCard.headword }}</h2>
                  <span v-if="selectedCard.pronunciation" lang="ko" class="text-sm text-muted">
                    [{{ selectedCard.pronunciation }}]
                  </span>
                  <span
                    v-if="selectedCard.partOfSpeech"
                    class="rounded-md border border-interface/15 bg-ink-lift px-2 py-0.5 text-xs text-muted"
                  >
                    {{ selectedCard.partOfSpeech }}
                  </span>
                </div>
                <p v-if="selectedCard.frequencyRank" class="mt-1 text-xs font-medium text-accent">
                  Frequency #{{ selectedCard.frequencyRank.toLocaleString() }}
                </p>
              </div>

              <button
                type="button"
                class="rounded-lg border border-interface/15 px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-danger/40 hover:text-danger"
                @click="removeSelectedCard"
              >
                Delete Card
              </button>
            </div>

            <div v-if="selectedCard.definitions.length > 0 || selectedCard.koreanDefinitions.length > 0">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-muted">Definitions</h3>
              <ul class="mt-2 list-disc space-y-1.5 pl-5 text-sm text-paper">
                <li
                  v-for="(def, idx) in selectedCard.definitions.length > 0
                    ? selectedCard.definitions
                    : selectedCard.koreanDefinitions"
                  :key="idx"
                >
                  {{ def }}
                </li>
              </ul>
            </div>

            <div class="flex flex-col gap-3">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-muted">
                Mined Contexts ({{ selectedCard.contexts.length }})
              </h3>

              <div
                v-for="ctx in selectedCard.contexts"
                :key="ctx.id"
                class="rounded-xl border border-interface/10 bg-ink p-4"
              >
                <p lang="ko" class="text-lg leading-relaxed text-paper">
                  <span>{{ splitHighlight(ctx.sentence, ctx.originalForm).before }}</span>
                  <mark
                    v-if="splitHighlight(ctx.sentence, ctx.originalForm).match"
                    class="rounded bg-transparent px-0.5 font-bold text-[#f59e0b]"
                  >{{ splitHighlight(ctx.sentence, ctx.originalForm).match }}</mark>
                  <span>{{ splitHighlight(ctx.sentence, ctx.originalForm).after }}</span>
                </p>

                <img
                  v-if="ctx.imageDataUrl"
                  :src="ctx.imageDataUrl"
                  :alt="ctx.sourceTitle"
                  class="mt-3 max-h-56 w-auto rounded-lg border border-interface/10 object-contain"
                />

                <div class="mt-3 flex flex-wrap items-center gap-2.5">
                  <button
                    v-if="ctx.audioDataUrl"
                    type="button"
                    class="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                    @click="playContextAudio(ctx.id)"
                  >
                    {{ playingContextId === ctx.id ? 'Playing…' : 'Play Audio' }}
                  </button>
                  <audio
                    v-if="ctx.audioDataUrl"
                    :ref="(el) => setAudioRef(ctx.id, el)"
                    :src="ctx.audioDataUrl"
                    @ended="onAudioEnded(ctx.id)"
                  />

                  <button
                    v-if="ctx.sourceUrl"
                    type="button"
                    class="rounded-lg border border-interface/15 bg-ink-soft px-3 py-1.5 text-xs font-medium text-paper transition-colors hover:bg-ink-lift"
                    @click="openSource(ctx.sourceUrl, ctx.timestamp)"
                  >
                    Open Source
                  </button>

                  <span class="truncate text-xs text-muted">{{ ctx.sourceTitle }}</span>
                </div>
              </div>

              <p v-if="linkStatus" class="text-xs text-muted">{{ linkStatus }}</p>
            </div>
          </article>
        </section>
        </template>
      </div>
    </main>
  </div>
</template>
