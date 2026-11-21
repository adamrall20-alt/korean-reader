<script setup lang="ts">
import logo from '@/assets/New logo update.png';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  buildSourceLink,
  type DesktopCardDetail,
  type ReviewQueueSummary,
  type ReviewRatingPreview,
  type ReviewRatingValue,
} from '../shared/api';

const emit = defineEmits<{
  (e: 'open-library'): void;
  (e: 'open-settings'): void;
  (e: 'queue-changed', queue: ReviewQueueSummary): void;
}>();

const currentCard = ref<DesktopCardDetail | null>(null);
const ratingPreviews = ref<ReviewRatingPreview[]>([]);
const queue = ref<ReviewQueueSummary>({
  newAvailable: 0,
  totalNewRemaining: 0,
  dueLearning: 0,
  dueReviews: 0,
  totalDue: 0,
  reviewedToday: 0,
  dailyNewLimit: 20,
  dailyReviewLimit: 200,
  dailyLimitReached: false,
  canUndo: false,
});

const revealed = ref(false);
const loading = ref(false);
const submitting = ref(false);
const errorMessage = ref('');
const statusMessage = ref('');
const audioEl = ref<HTMLAudioElement | null>(null);
const isPlayingAudio = ref(false);
let elapsedMs = 0;
let focusedAt: number | null = null;

function pauseTimer() {
  if (focusedAt !== null) elapsedMs += performance.now() - focusedAt;
  focusedAt = null;
}

function resumeTimer() {
  if (currentCard.value && focusedAt === null && !document.hidden && document.hasFocus()) {
    focusedAt = performance.now();
  }
}

function handleVisibility() {
  if (document.hidden) pauseTimer();
  else resumeTimer();
}

const primaryContext = computed(() => {
  const card = currentCard.value;
  if (!card || card.contexts.length === 0) return null;
  if (card.preferredContextId) {
    const preferred = card.contexts.find((c) => c.id === card.preferredContextId);
    if (preferred) return preferred;
  }
  return card.contexts[0] ?? null;
});

const extraContexts = computed(() => {
  const card = currentCard.value;
  const primary = primaryContext.value;
  if (!card || !primary) return [];
  return card.contexts.filter((c) => c.id !== primary.id);
});

const reviewImageDataUrl = computed(() => {
  return (
    primaryContext.value?.imageDataUrl ||
    currentCard.value?.contexts.find((c) => Boolean(c.imageDataUrl))?.imageDataUrl ||
    ''
  );
});

const reviewAudioDataUrl = computed(() => {
  return (
    primaryContext.value?.audioDataUrl ||
    currentCard.value?.contexts.find((c) => Boolean(c.audioDataUrl))?.audioDataUrl ||
    ''
  );
});

function splitHighlight(sentence: string, originalForm: string, headword: string) {
  const stem = headword.endsWith('다') && headword.length >= 2 ? headword.slice(0, -1) : '';
  const target = originalForm && sentence.includes(originalForm)
    ? originalForm
    : headword && sentence.includes(headword)
      ? headword
      : stem && sentence.includes(stem)
        ? stem
        : '';
  if (!target) {
    return { before: sentence, match: '', after: '' };
  }
  const idx = sentence.indexOf(target);
  return {
    before: sentence.slice(0, idx),
    match: target,
    after: sentence.slice(idx + target.length),
  };
}

function pauseAudio() {
  const el = audioEl.value;
  if (!el) return;
  el.pause();
}

function revealAnswer() {
  pauseAudio();
  revealed.value = true;
}

function replayAudio() {
  const el = audioEl.value;
  if (!el) return;
  el.load();
  el.currentTime = 0;
  void el.play().catch(() => {
    // Ignore autoplay restrictions
  });
}

async function loadNextCard() {
  const api = window.koreanReaderDesktop;
  if (!api?.getNextReviewCard) {
    errorMessage.value = 'Review engine is unavailable.';
    return;
  }
  loading.value = true;
  errorMessage.value = '';
  revealed.value = false;
  try {
    const result = await api.getNextReviewCard();
    pauseTimer();
    elapsedMs = 0;
    currentCard.value = result.card;
    resumeTimer();
    ratingPreviews.value = result.ratingPreviews;
    queue.value = result.queue;
    emit('queue-changed', result.queue);

    if (result.card) {
      await nextTick();
      if (reviewAudioDataUrl.value) {
        replayAudio();
      }
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load next review card.';
  } finally {
    loading.value = false;
  }
}

async function handleRefreshQueue() {
  statusMessage.value = '';
  await loadNextCard();
  if (!currentCard.value && !errorMessage.value) {
    statusMessage.value = 'Queue refreshed — no more cards due right now.';
  }
}

async function studyMoreNewCards(extraCount = 10) {
  const api = window.koreanReaderDesktop;
  if (!api?.saveReviewSettings) return;
  statusMessage.value = '';
  errorMessage.value = '';
  try {
    await api.saveReviewSettings({
      dailyNewLimit: queue.value.dailyNewLimit + extraCount,
    });
    await loadNextCard();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to update daily new limit.';
  }
}

async function handleRate(rating: ReviewRatingValue) {
  const api = window.koreanReaderDesktop;
  if (!api?.submitReview || !currentCard.value || submitting.value) return;
  pauseAudio();
  submitting.value = true;
  errorMessage.value = '';
  statusMessage.value = '';
  try {
    const durationMs = elapsedMs + (focusedAt === null ? 0 : performance.now() - focusedAt);
    const res = await api.submitReview(currentCard.value.id, rating, durationMs);
    if (!res.ok) {
      errorMessage.value = res.error ?? 'Failed to save review.';
      return;
    }
    await loadNextCard();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to save review.';
  } finally {
    submitting.value = false;
  }
}

async function handleUndo() {
  const api = window.koreanReaderDesktop;
  if (!api?.undoLastReview || !queue.value.canUndo || submitting.value) return;
  submitting.value = true;
  errorMessage.value = '';
  statusMessage.value = '';
  try {
    const res = await api.undoLastReview();
    if (!res.ok) {
      errorMessage.value = res.error ?? 'Nothing to undo.';
      return;
    }
    statusMessage.value = 'Undid last review.';
    await loadNextCard();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to undo review.';
  } finally {
    submitting.value = false;
  }
}

async function handleOpenSource(sourceUrl: string, timestamp?: number) {
  const api = window.koreanReaderDesktop;
  if (!api || !sourceUrl) return;
  const fullUrl = buildSourceLink(sourceUrl, timestamp);
  await api.openExternalUrl(fullUrl);
}

function ratingButtonStyle(rating: ReviewRatingValue): string {
  switch (rating) {
    case 1:
      return 'border-red-500/40 hover:border-red-500 hover:bg-red-500/10 text-red-400';
    case 2:
      return 'border-amber-500/40 hover:border-amber-500 hover:bg-amber-500/10 text-amber-400';
    case 3:
      return 'border-emerald-500/40 hover:border-emerald-500 hover:bg-emerald-500/10 text-emerald-400';
    case 4:
      return 'border-sky-500/40 hover:border-sky-500 hover:bg-sky-500/10 text-sky-400';
  }
}

function handleKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    void handleUndo();
    return;
  }

  if (!currentCard.value || submitting.value) return;

  if (event.key.toLowerCase() === 'r') {
    event.preventDefault();
    replayAudio();
    return;
  }

  if (!revealed.value && (event.code === 'Space' || event.key === 'Enter')) {
    event.preventDefault();
    revealAnswer();
    return;
  }

  if (revealed.value) {
    if (event.key === '1') {
      event.preventDefault();
      void handleRate(1);
    } else if (event.key === '2') {
      event.preventDefault();
      void handleRate(2);
    } else if (event.key === '3' || event.code === 'Space' || event.key === 'Enter') {
      event.preventDefault();
      void handleRate(3);
    } else if (event.key === '4') {
      event.preventDefault();
      void handleRate(4);
    }
  }
}

watch(currentCard, () => {
  isPlayingAudio.value = false;
});

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('focus', resumeTimer);
  window.addEventListener('blur', pauseTimer);
  document.addEventListener('visibilitychange', handleVisibility);
  void loadNextCard();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('focus', resumeTimer);
  window.removeEventListener('blur', pauseTimer);
  document.removeEventListener('visibilitychange', handleVisibility);
});

defineExpose({
  refresh: loadNextCard,
});
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4">
    <!-- Queue status strip -->
    <div
      class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-interface/15 bg-ink-soft px-4 py-2.5 text-xs"
    >
      <div class="flex flex-wrap items-center gap-3">
        <span class="font-medium text-sky-400">
          New: <strong>{{ queue.newAvailable }}</strong>
        </span>
        <span class="font-medium text-amber-400">
          Learning: <strong>{{ queue.dueLearning }}</strong>
        </span>
        <span class="font-medium text-emerald-400">
          Review: <strong>{{ queue.dueReviews }}</strong>
        </span>
        <span class="text-muted">
          · Reviewed today:
          <strong class="text-paper">{{ queue.reviewedToday }} / {{ queue.dailyReviewLimit }}</strong>
        </span>
      </div>

      <div class="flex items-center gap-2">
        <span v-if="statusMessage" class="text-muted">{{ statusMessage }}</span>
        <button
          type="button"
          class="rounded-md border border-interface/15 px-2.5 py-1 text-xs font-medium text-paper transition hover:bg-ink-lift disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="!queue.canUndo || submitting"
          title="Undo last review (Cmd/Ctrl+Z)"
          @click="handleUndo"
        >
          Undo
        </button>
      </div>
    </div>

    <div
      v-if="errorMessage"
      class="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400"
    >
      {{ errorMessage }}
    </div>

    <!-- Loading state -->
    <div
      v-if="loading && !currentCard"
      class="flex flex-1 items-center justify-center rounded-2xl border border-interface/15 bg-ink-soft p-10 text-sm text-muted"
    >
      Loading review queue…
    </div>

    <!-- Caught-up / empty state -->
    <div
      v-else-if="!currentCard"
      class="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-interface/15 bg-ink-soft p-10 text-center"
    >
      <img v-if="queue.dailyLimitReached" :src="logo" alt="" class="size-20 object-contain" />
      <div v-else class="text-4xl" aria-hidden="true">🎉</div>
      <h2 class="text-xl font-semibold text-paper">
        {{ queue.dailyLimitReached ? 'Daily review limit reached' : 'All caught up for now!' }}
      </h2>
      <p class="max-w-md text-sm text-muted">
        <template v-if="queue.dailyLimitReached">
          You have reached your daily limit of {{ queue.dailyReviewLimit }} reviews. You can adjust daily limits in Settings.
        </template>
        <template v-else-if="queue.totalNewRemaining > 0 && queue.reviewedToday > 0">
          You have completed {{ queue.reviewedToday }} review{{ queue.reviewedToday === 1 ? '' : 's' }} today and reached today's limit of {{ queue.dailyNewLimit }} new cards ({{ queue.totalNewRemaining.toLocaleString() }} unseen remaining).
        </template>
        <template v-else-if="queue.reviewedToday > 0">
          You have completed {{ queue.reviewedToday }} review{{ queue.reviewedToday === 1 ? '' : 's' }} today.
        </template>
        <template v-else>
          No cards are currently due. Import cards from Chrome or Anki in your Library to start reviewing.
        </template>
      </p>
      <div class="flex flex-wrap items-center justify-center gap-3 pt-1">
        <button
          v-if="!queue.dailyLimitReached && queue.totalNewRemaining > 0"
          type="button"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          @click="studyMoreNewCards(10)"
        >
          Study +10 New Cards
        </button>
        <button
          v-if="queue.dailyLimitReached"
          type="button"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          @click="emit('open-settings')"
        >
          Open Settings
        </button>
        <button
          v-else
          type="button"
          class="rounded-lg border border-interface/15 px-4 py-2 text-sm font-medium text-paper transition hover:bg-ink-lift"
          @click="emit('open-library')"
        >
          Open Library
        </button>
        <button
          type="button"
          class="rounded-lg border border-interface/15 px-4 py-2 text-sm font-medium text-paper transition hover:bg-ink-lift"
          @click="handleRefreshQueue"
        >
          Refresh Queue
        </button>
      </div>
    </div>

    <!-- Active Review Card -->
    <div
      v-else
      class="flex flex-1 flex-col justify-between gap-6 rounded-2xl border border-interface/15 bg-ink-soft p-6 shadow-sm"
    >
      <!-- Card Front -->
      <div class="flex flex-col items-center gap-4 text-center">
        <!-- Focus word heading -->
        <div class="text-base font-semibold tracking-wide text-accent">
          {{ currentCard.headword }}
        </div>

        <!-- Audio -->
        <div v-if="reviewAudioDataUrl" class="flex items-center gap-2">
          <audio
            :key="currentCard.id"
            ref="audioEl"
            :src="reviewAudioDataUrl"
            @play="isPlayingAudio = true"
            @ended="isPlayingAudio = false"
            @pause="isPlayingAudio = false"
          />
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-full border border-interface/15 px-4 py-1.5 text-xs font-medium text-paper transition hover:border-accent hover:text-accent"
            title="Replay audio (R)"
            @click="replayAudio"
          >
            <span>{{ isPlayingAudio ? '🔊 Playing…' : '▶ Replay Audio (R)' }}</span>
          </button>
        </div>

        <!-- Image -->
        <img
          v-if="reviewImageDataUrl"
          :src="reviewImageDataUrl"
          :alt="currentCard.headword"
          class="max-h-64 w-auto rounded-xl border border-interface/15 object-contain"
        />

        <!-- Sentence with orange focus-word highlight -->
        <div
          v-if="primaryContext"
          class="max-w-2xl whitespace-pre-line text-2xl leading-relaxed font-medium text-paper"
        >
          <template
            v-for="parts in [splitHighlight(primaryContext.sentence, primaryContext.originalForm, currentCard.headword)]"
            :key="primaryContext.id"
          >
            <span>{{ parts.before }}</span>
            <span v-if="parts.match" class="font-bold text-[#f59e0b]">{{ parts.match }}</span>
            <span>{{ parts.after }}</span>
          </template>
        </div>
      </div>

      <!-- Card Back (Revealed) -->
      <div
        v-if="revealed"
        class="flex flex-col gap-4 border-t border-interface/15 pt-5"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <div class="flex flex-wrap items-baseline gap-2.5">
            <h2 class="text-2xl font-bold text-paper">{{ currentCard.headword }}</h2>
            <span v-if="currentCard.pronunciation" class="text-sm text-muted">
              [{{ currentCard.pronunciation }}]
            </span>
            <span
              v-if="currentCard.partOfSpeech"
              class="rounded-full border border-interface/15 px-2 py-0.5 text-xs text-muted"
            >
              {{ currentCard.partOfSpeech }}
            </span>
          </div>
          <span
            v-if="currentCard.frequencyRank"
            class="text-xs font-semibold text-accent"
          >
            #{{ currentCard.frequencyRank.toLocaleString() }}
          </span>
        </div>

        <!-- Definitions -->
        <div class="flex flex-col gap-1.5 text-sm text-paper">
          <template v-if="currentCard.definitions.length > 0">
            <p v-for="(def, idx) in currentCard.definitions" :key="idx" class="leading-relaxed">
              {{ def }}
            </p>
          </template>
          <template v-else-if="currentCard.koreanDefinitions.length > 0">
            <p v-for="(def, idx) in currentCard.koreanDefinitions" :key="idx" class="leading-relaxed">
              {{ def }}
            </p>
          </template>
          <p v-else class="italic text-muted">No definition stored.</p>
        </div>

        <!-- Source link -->
        <div
          v-if="primaryContext?.sourceTitle || primaryContext?.sourceUrl"
          class="flex items-center justify-between text-xs text-muted"
        >
          <span>Source: {{ primaryContext.sourceTitle || primaryContext.sourceUrl }}</span>
          <button
            v-if="primaryContext.sourceUrl"
            type="button"
            class="text-accent hover:underline"
            @click="handleOpenSource(primaryContext.sourceUrl, primaryContext.timestamp)"
          >
            Open video ↗
          </button>
        </div>

        <!-- Extra contexts -->
        <div
          v-if="extraContexts.length > 0"
          class="mt-1 flex flex-col gap-2 rounded-xl border border-interface/15 bg-ink p-3 text-xs text-muted"
        >
          <div class="font-semibold uppercase tracking-wide">Other examples</div>
          <div v-for="ctx in extraContexts" :key="ctx.id" class="flex flex-col gap-1.5 text-paper">
            <span>{{ ctx.sentence }}</span>
            <div v-if="ctx.imageDataUrl || ctx.audioDataUrl" class="flex flex-wrap items-center gap-2">
              <img
                v-if="ctx.imageDataUrl"
                :src="ctx.imageDataUrl"
                :alt="ctx.sentence"
                class="h-14 w-auto rounded-md border border-interface/15 object-cover"
              />
              <audio v-if="ctx.audioDataUrl" :src="ctx.audioDataUrl" controls class="h-8 max-w-xs" />
            </div>
          </div>
        </div>
      </div>

      <!-- Footer actions -->
      <div class="border-t border-interface/15 pt-4">
        <div v-if="!revealed" class="flex justify-center">
          <button
            type="button"
            class="w-full max-w-xs rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            @click="revealAnswer"
          >
            Show Answer <span class="ml-1 opacity-75">(Space)</span>
          </button>
        </div>

        <div v-else class="grid grid-cols-4 gap-2.5">
          <button
            v-for="preview in ratingPreviews"
            :key="preview.rating"
            type="button"
            class="flex flex-col items-center gap-0.5 rounded-xl border px-3 py-2.5 transition disabled:opacity-50"
            :class="ratingButtonStyle(preview.rating)"
            :disabled="submitting"
            @click="handleRate(preview.rating)"
          >
            <span class="text-xs opacity-75">{{ preview.intervalText }}</span>
            <span class="text-sm font-semibold">
              <span class="mr-1 text-xs opacity-60">{{ preview.rating }}</span>{{ preview.label }}
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
