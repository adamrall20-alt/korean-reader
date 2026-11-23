<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { browser } from 'wxt/browser';
import ReaderPageHeader from './ReaderPageHeader.vue';
import ReaderIcon from './ReaderIcon.vue';
import stars from '@/assets/stars.png';
import type { AnkiResponse } from '@/types/anki';
import type { AnkiDeckStatistics, HistoryResponse, KnownWordHistory } from '@/types/statistics';
import { readingLanguage, type ReaderLanguage } from '@/types/language';
import { vocabularyRevisionKey } from '@/types/vocabulary';

const language = ref<ReaderLanguage>(readingLanguage(new URLSearchParams(location.search).get('language')));
const history = ref<KnownWordHistory | null>(null);
const loadingHistory = ref(true);
const historyError = ref('');
const deck = ref<AnkiDeckStatistics | null>(null);
const deckName = ref('');
const loadingDeck = ref(true);
const deckError = ref('');
const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const formatDate = (at: number) => dateFormat.format(at);
const formatCount = (count: number) => count.toLocaleString();
function formatReviewTime(milliseconds: number): string {
  const minutes = Math.round(milliseconds / 60_000);
  if (milliseconds && !minutes) return '< 1 min';
  const hours = Math.floor(minutes / 60);
  return hours ? `${formatCount(hours)} h ${minutes % 60} min` : `${minutes} min`;
}

const points = computed(() => history.value ? [history.value.baseline, ...history.value.days] : []);
const current = computed(() => points.value.at(-1));
const gain = computed(() => current.value && history.value ? current.value.count - history.value.baseline.count : 0);

const chart = computed(() => {
  const first = points.value[0];
  const last = current.value;
  if (!first || !last) return null;
  const counts = points.value.map(({ count }) => count);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const duration = last.at - first.at;
  const positions = points.value.map(({ at, count }, index) => ({
    x: duration ? (at - first.at) / duration * 100 : index / Math.max(1, counts.length - 1) * 100,
    y: max === min ? 50 : 92 - (count - min) / (max - min) * 84,
  }));
  const path = positions.map(({ x, y }, index) => index ? `H${x} V${y}` : `M${x} ${y}`).join(' ');
  return { min, max, path, end: positions.at(-1)! };
});

let historyRequest = 0;
let deckRequest = 0;
const languageFields = () => language.value === 'ja' ? { language: 'ja' as const } : {};

async function loadHistory() {
  const request = ++historyRequest;
  loadingHistory.value = true;
  historyError.value = '';
  try {
    const response: HistoryResponse = await browser.runtime.sendMessage({
      type: 'get-known-word-history', ...languageFields(),
    });
    if (!response.ok) throw new Error(response.error);
    if (request === historyRequest) history.value = response.history;
  } catch (error) {
    if (request === historyRequest) {
      historyError.value = error instanceof Error ? error.message : 'Could not load known-word history.';
    }
  } finally {
    if (request === historyRequest) loadingHistory.value = false;
  }
}

async function loadDeck() {
  const request = ++deckRequest;
  loadingDeck.value = true;
  deckError.value = '';
  deck.value = null;
  try {
    const response: AnkiResponse = await browser.runtime.sendMessage({ type: 'get-anki-deck-statistics', ...languageFields() });
    if (request !== deckRequest) return;
    deckName.value = (response.ok ? response.deckStatistics?.deckName : response.deckName) ?? '';
    if (!response.ok) throw new Error(response.error);
    deck.value = response.deckStatistics ?? null;
  } catch (error) {
    if (request === deckRequest) deckError.value = error instanceof Error ? error.message : 'Could not load Anki deck statistics.';
  } finally {
    if (request === deckRequest) loadingDeck.value = false;
  }
}

function onStorageChanged(changes: Record<string, unknown>, area: string) {
  if (area === 'local' && vocabularyRevisionKey(language.value) in changes) void loadHistory();
}

watch(language, () => {
  history.value = null;
  deckName.value = '';
  void loadHistory();
  void loadDeck();
});

onMounted(() => {
  browser.storage.onChanged.addListener(onStorageChanged);
  void loadHistory();
  void loadDeck();
});
onBeforeUnmount(() => browser.storage.onChanged.removeListener(onStorageChanged));
</script>

<template>
  <div class="min-h-screen bg-cover bg-center bg-fixed text-paper" :style="{ backgroundImage: `linear-gradient(var(--reading-backdrop), var(--reading-backdrop)), url(${stars})` }">
    <ReaderPageHeader page="statistics" />

    <main class="mx-auto grid max-w-5xl gap-6 px-6 py-8">
    <h1 class="sr-only">Statistics</h1>
    <label class="flex items-center gap-3 text-sm">
      Statistics language
      <select v-model="language" class="rounded-lg border border-interface/15 bg-ink px-2 py-1">
        <option value="ko">Korean</option>
        <option value="ja">Japanese</option>
      </select>
    </label>

    <section aria-labelledby="known-words-heading" class="grid gap-4 rounded-xl border border-interface/10 bg-ink-soft p-5">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="known-words-heading" class="flex items-center gap-2 font-semibold">
          <ReaderIcon name="statistics" class="size-5 shrink-0 text-accent" /> Known words over time
        </h2>
        <p v-if="history" class="text-xs text-muted">Since {{ formatDate(history.baseline.at) }}</p>
      </div>
      <p v-if="historyError" class="text-sm text-danger" role="alert">{{ historyError }} <button type="button" class="underline" @click="loadHistory()">Retry</button></p>
      <template v-if="history && current && chart">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p class="text-3xl font-semibold tabular-nums">{{ formatCount(current.count) }}</p>
          <p class="text-sm" :class="gain >= 0 ? 'text-accent' : 'text-muted'">
            {{ gain > 0 ? '+' : '' }}{{ formatCount(gain) }} since tracking began
          </p>
        </div>
        <div class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 text-xs text-muted">
          <div class="relative h-36 tabular-nums" aria-hidden="true">
            <span v-if="chart.min === chart.max" class="absolute top-1/2 -translate-y-1/2">{{ formatCount(chart.min) }}</span>
            <template v-else>
              <span class="absolute top-[8%] -translate-y-1/2">{{ formatCount(chart.max) }}</span>
              <span class="absolute top-[92%] -translate-y-1/2">{{ formatCount(chart.min) }}</span>
            </template>
            <span class="invisible">{{ formatCount(chart.max) }}</span>
          </div>
          <div>
            <div class="relative h-36">
              <svg class="size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" :aria-label="`Known words went from ${history.baseline.count} to ${current.count}`">
                <path d="M0 8H100 M0 50H100 M0 92H100" class="stroke-line" fill="none" vector-effect="non-scaling-stroke" />
                <path :d="chart.path" class="reader-chart-line stroke-accent" fill="none" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
              </svg>
              <span aria-hidden="true" class="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" :style="{ left: chart.end.x + '%', top: chart.end.y + '%' }" />
            </div>
            <div class="flex flex-wrap justify-between gap-2 pt-1">
              <span>{{ formatDate(history.baseline.at) }}</span>
              <span v-if="formatDate(current.at) !== formatDate(history.baseline.at)">{{ formatDate(current.at) }}</span>
            </div>
          </div>
        </div>
        <details class="text-sm">
          <summary class="cursor-pointer text-muted">View recorded totals</summary>
          <table class="mt-2 w-full text-left tabular-nums">
            <thead><tr><th scope="col">Date</th><th scope="col" class="text-right">Known words</th></tr></thead>
            <tbody>
              <tr v-for="(point, index) in points" :key="index" class="border-t border-interface/10">
                <td class="py-1">{{ formatDate(point.at) }}{{ index === 0 ? ' · Tracking started' : '' }}</td>
                <td class="text-right">{{ formatCount(point.count) }}</td>
              </tr>
            </tbody>
          </table>
        </details>
      </template>
      <p v-else-if="loadingHistory" class="text-sm text-muted" role="status">Loading known-word history…</p>
    </section>

    <section aria-labelledby="anki-deck-heading" class="grid gap-4 rounded-xl border border-interface/10 bg-ink-soft p-5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 id="anki-deck-heading" class="flex items-center gap-2 font-semibold">
          <ReaderIcon name="anki" class="size-5 shrink-0 text-accent" />
          <span>Anki deck <span v-if="deckName" class="ml-1 text-accent">{{ deckName }}</span></span>
        </h2>
        <button type="button" class="rounded-lg border border-interface/15 px-3 py-1.5 text-sm hover:bg-interface/5 disabled:opacity-50" :disabled="loadingDeck" @click="loadDeck">Refresh</button>
      </div>
      <p v-if="loadingDeck" role="status" class="text-sm text-muted">Loading Anki deck statistics…</p>
      <div v-else-if="deckError" class="text-sm">
        <p role="alert" class="text-danger">{{ deckError }}</p>
        <a href="/options.html#anki" class="mt-2 inline-block text-muted underline">Anki settings</a>
      </div>
      <template v-else-if="deck">
        <dl class="grid gap-4 sm:grid-cols-3">
          <div>
            <dt class="text-sm text-muted">Reviews left today</dt>
            <dd v-if="deck.reviewsToday !== null" class="text-2xl font-semibold tabular-nums">{{ formatCount(deck.reviewsToday) }}</dd>
            <dd v-else class="mt-1 text-sm text-muted">Unavailable from AnkiConnect</dd>
          </div>
          <div>
            <dt class="text-sm text-muted">Total reviews done</dt>
            <dd v-if="deck.history" class="text-2xl font-semibold tabular-nums">{{ formatCount(deck.history.totalReviews) }}</dd>
            <dd v-else class="mt-1 text-sm text-muted">History unavailable</dd>
          </div>
          <div>
            <dt class="text-sm text-muted">Time spent reviewing</dt>
            <dd v-if="deck.history" class="text-2xl font-semibold tabular-nums">{{ formatReviewTime(deck.history.reviewMilliseconds) }}</dd>
            <dd v-else class="mt-1 text-sm text-muted">History unavailable</dd>
          </div>
        </dl>
        <dl class="grid gap-4 border-t border-interface/10 pt-4 sm:grid-cols-3">
          <div>
            <dt class="text-sm text-muted">Due in the next 7 days</dt>
            <dd v-if="deck.reviewsNextWeek !== null" class="text-2xl font-semibold tabular-nums">{{ formatCount(deck.reviewsNextWeek) }}</dd>
            <dd v-else class="mt-1 text-sm text-muted">Unavailable from AnkiConnect</dd>
          </div>
          <div>
            <dt class="text-sm text-muted">Deck words marked known</dt>
            <template v-if="deck.coverage?.totalWords">
              <dd class="text-2xl font-semibold tabular-nums">{{ Math.round(deck.coverage.knownWords / deck.coverage.totalWords * 100) }}%</dd>
              <dd class="text-xs text-muted">{{ formatCount(deck.coverage.knownWords) }} of {{ formatCount(deck.coverage.totalWords) }} unique words</dd>
            </template>
            <dd v-else class="mt-1 text-sm text-muted">{{ deck.coverage ? 'No usable focus words' : 'Deck coverage unavailable' }}</dd>
          </div>
        </dl>
      </template>
      <p v-else class="text-sm text-muted">Choose an Anki deck in <a href="/options.html#anki" class="underline">Settings</a> to see its statistics.</p>
    </section>
    </main>
  </div>
</template>
