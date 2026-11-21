<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { VocabularyEntry } from '../../../types/vocabulary';
import { buildSourceLink, type DesktopRuntimeInfo } from '../shared/api';

const entry = ref<VocabularyEntry | null>(null);
const runtime = ref<DesktopRuntimeInfo | null>(null);
const audioElement = ref<HTMLAudioElement | null>(null);
const audioStatus = ref<string>('Ready');
const linkStatus = ref<string>('');
const loadError = ref<string>('');

const primaryContext = computed(() => entry.value?.contexts[0] ?? null);

const sentenceParts = computed(() => {
  const ctx = primaryContext.value;
  if (!ctx) return { before: '', match: '', after: '' };
  const idx = ctx.sentence.indexOf(ctx.originalForm);
  if (idx < 0) return { before: ctx.sentence, match: '', after: '' };
  return {
    before: ctx.sentence.slice(0, idx),
    match: ctx.originalForm,
    after: ctx.sentence.slice(idx + ctx.originalForm.length),
  };
});

const sourceHref = computed(() => {
  const ctx = primaryContext.value;
  if (!ctx) return '';
  return buildSourceLink(ctx.sourceUrl, ctx.timestamp);
});

async function playAudio() {
  if (!audioElement.value) return;
  try {
    audioElement.value.currentTime = 0;
    audioStatus.value = 'Playing...';
    await audioElement.value.play();
  } catch (err) {
    audioStatus.value = err instanceof Error ? `Playback failed: ${err.message}` : 'Playback failed';
  }
}

function onAudioEnded() {
  audioStatus.value = 'Played';
}

async function openSource() {
  if (!sourceHref.value || !window.koreanReaderDesktop) return;
  linkStatus.value = 'Opening in default browser...';
  const result = await window.koreanReaderDesktop.openExternalUrl(sourceHref.value);
  linkStatus.value = result.ok ? 'Opened in default browser' : (result.error ?? 'Could not open link');
}

onMounted(async () => {
  const api = window.koreanReaderDesktop;
  if (!api) {
    loadError.value = 'Desktop bridge unavailable. Launch this window through Electron.';
    return;
  }
  try {
    const [sample, info] = await Promise.all([api.getSampleEntry(), api.getRuntimeInfo()]);
    entry.value = sample;
    runtime.value = info;
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to load desktop fixture.';
  }
});
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-8">
    <header class="flex items-center justify-between border-b border-slate-800 pb-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wider text-amber-400">Phase D0 — Foundation Spike</p>
        <h1 class="mt-1 text-2xl font-bold text-slate-50">Korean Reader Desktop</h1>
      </div>
      <span
        v-if="runtime"
        class="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300"
      >
        {{ runtime.platform }} / {{ runtime.arch }}
      </span>
    </header>

    <div
      v-if="loadError"
      class="rounded-xl border border-rose-500/40 bg-rose-950/40 p-4 text-sm text-rose-200"
    >
      {{ loadError }}
    </div>

    <section
      v-if="entry && primaryContext"
      aria-label="Sample mined card"
      class="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-lg"
    >
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <div class="flex items-baseline gap-3">
          <h2 class="text-3xl font-bold text-amber-400">{{ entry.headword }}</h2>
          <span v-if="entry.pronunciation" class="text-sm text-slate-400">[{{ entry.pronunciation }}]</span>
          <span v-if="entry.partOfSpeech" class="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
            {{ entry.partOfSpeech }}
          </span>
        </div>
        <span v-if="entry.frequencyRank" class="text-xs text-slate-400">
          #{{ entry.frequencyRank.toLocaleString() }}
        </span>
      </div>

      <p class="mt-5 rounded-xl bg-slate-950/70 p-4 text-xl leading-relaxed text-slate-100">
        <span>{{ sentenceParts.before }}</span>
        <mark
          v-if="sentenceParts.match"
          class="rounded bg-amber-500/20 px-1 font-semibold text-amber-300"
        >{{ sentenceParts.match }}</mark>
        <span>{{ sentenceParts.after }}</span>
      </p>

      <ul class="mt-4 list-disc space-y-1.5 pl-5 text-sm text-slate-300">
        <li v-for="(def, idx) in entry.definitions" :key="idx">{{ def }}</li>
      </ul>

      <div class="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-800 pt-4">
        <button
          type="button"
          class="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
          @click="playAudio"
        >
          Play Captured Audio
        </button>
        <span class="text-xs text-slate-400">{{ audioStatus }}</span>
        <audio
          v-if="primaryContext.audio"
          ref="audioElement"
          :src="primaryContext.audio"
          @ended="onAudioEnded"
        />

        <div class="ml-auto flex items-center gap-3">
          <span v-if="linkStatus" class="text-xs text-slate-400">{{ linkStatus }}</span>
          <button
            type="button"
            class="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-700"
            @click="openSource"
          >
            Open Source in Browser
          </button>
        </div>
      </div>

      <p class="mt-3 text-xs text-slate-500">
        Source: {{ primaryContext.sourceTitle }} ({{ sourceHref }})
      </p>
    </section>

    <section
      v-if="runtime"
      aria-label="Runtime verification"
      class="rounded-2xl border border-slate-800 bg-slate-900/50 p-5"
    >
      <h3 class="text-sm font-semibold text-slate-200">Runtime &amp; Storage Verification</h3>
      <dl class="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
        <div class="rounded-lg bg-slate-950/60 p-3">
          <dt class="text-slate-400">Electron</dt>
          <dd class="mt-1 font-mono text-slate-100">{{ runtime.electron }}</dd>
        </div>
        <div class="rounded-lg bg-slate-950/60 p-3">
          <dt class="text-slate-400">Node / Chromium</dt>
          <dd class="mt-1 font-mono text-slate-100">{{ runtime.node }} / {{ runtime.chrome }}</dd>
        </div>
        <div class="rounded-lg bg-slate-950/60 p-3">
          <dt class="text-slate-400">SQLite (node:sqlite)</dt>
          <dd class="mt-1 font-semibold" :class="runtime.sqliteAvailable ? 'text-emerald-400' : 'text-rose-400'">
            {{ runtime.sqliteAvailable ? 'Verified' : 'Unavailable' }}
          </dd>
        </div>
      </dl>

      <div v-if="runtime.fsrsVerified" class="mt-4">
        <p class="text-xs text-slate-400">
          ts-fsrs verified (initial intervals for a new card):
        </p>
        <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div
            v-for="item in runtime.fsrsPreview"
            :key="item.rating"
            class="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-xs"
          >
            <div class="font-semibold text-slate-200">{{ item.rating }}</div>
            <div class="mt-0.5 text-slate-400">{{ item.state }} ({{ item.scheduledDays }}d)</div>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>
