<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import type { DesktopStudyStats } from '../shared/api';

const stats = shallowRef<DesktopStudyStats>();
const error = ref('');
const range = ref(0);
const ranges = [{ days: 30, label: '30 days' }, { days: 90, label: '90 days' }, { days: 0, label: 'All time' }];
const loading = ref(false);
const activePoint = ref<number>();
const number = new Intl.NumberFormat();
const percent = new Intl.NumberFormat(undefined, { style: 'percent' });
const date = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function desktopApi() {
  const api = window.koreanReaderDesktop;
  if (!api) throw new Error('Desktop storage is unavailable.');
  return api;
}

async function load() {
  if (loading.value) return;
  loading.value = true;
  error.value = '';
  try { stats.value = await desktopApi().getStudyStats(); }
  catch (failure) { error.value = failure instanceof Error ? failure.message : 'Could not load stats.'; }
  finally { loading.value = false; }
}

const points = computed(() => {
  const all = stats.value?.knownHistory ?? [];
  if (!range.value || !all.length) return all;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - range.value + 1);
  const inRange = all.filter((point) => point.at >= +cutoff);
  const baseline = all.filter((point) => point.at < +cutoff).at(-1);
  return baseline ? [{ at: +cutoff, count: baseline.count }, ...inRange] : inRange;
});
const graph = computed(() => {
  const data = points.value;
  const start = data[0]?.at ?? 0;
  const end = Math.max(start + 1, Date.now(), data.at(-1)?.at ?? 0);
  const counts = data.map(({ count }) => count);
  const low = Math.min(...counts);
  const high = Math.max(...counts);
  const padding = Math.max(1, Math.round((high - low) * 0.15));
  const bottom = Math.max(0, low - padding);
  const top = high + padding;
  const pattern = data.map((point) => ({ ...point, x: 8 + (point.at - start) / (end - start) * 584,
    y: 152 - (point.count - bottom) / (top - bottom) * 144 }));
  const path = pattern.map(({ x, y }, index) => index === 0 ? `M ${x} ${y}` : `H ${x} V ${y}`).join(' ');
  return { pattern, path: pattern.length ? `${path} H 592` : '', start, end };
});
const selected = computed(() => graph.value.pattern[activePoint.value ?? -1] ?? graph.value.pattern.at(-1));

const activity = computed(() => {
  const byDay = new Map(stats.value?.recentReviews.map(({ day, count }) => [day, count]));
  const today = new Date();
  return Array.from({ length: 30 }, (_, index) => {
    const day = new Date(today);
    day.setDate(day.getDate() - 29 + index);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    return { key, label: date.format(day), count: byDay.get(key) ?? 0 };
  });
});
const peak = computed(() => Math.max(1, ...activity.value.map(({ count }) => count)));

function duration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes >= 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} m`;
  return minutes ? `${minutes} m ${Math.floor(ms / 1000) % 60} s` : `${Math.floor(ms / 1000)} s`;
}

function trackPoint(event: PointerEvent) {
  const bounds = (event.currentTarget as SVGElement).getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width * 600;
  const next = graph.value.pattern.findIndex((point) => point.x > x);
  activePoint.value = next === -1 ? graph.value.pattern.length - 1 : next - 1;
  if (activePoint.value < 0) activePoint.value = 0;
}

onMounted(() => { void load(); window.addEventListener('focus', load); });
onBeforeUnmount(() => window.removeEventListener('focus', load));
</script>

<template>
  <div class="mx-auto grid w-full max-w-5xl gap-4">
    <header class="flex items-center justify-between gap-4">
      <h2 class="text-xl font-semibold">Study stats</h2>
      <button type="button" :disabled="loading" class="rounded-lg border border-interface/20 bg-ink-soft px-3 py-1.5 text-xs hover:bg-ink-lift" @click="load">{{ loading ? 'Refreshing…' : 'Refresh' }}</button>
    </header>
    <p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p>
    <template v-if="stats">
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div v-for="item in [
          { label: 'Known words', value: stats.knownWords === null ? '—' : number.format(stats.knownWords), detail: 'Words marked known in Chrome' },
          { label: 'Total reviews', value: number.format(stats.totalReviews), detail: 'All recorded SRS answers' },
          { label: 'Review time', value: duration(stats.reviewTimeMs), detail: stats.timedReviews < stats.totalReviews ? `${stats.timedReviews} of ${stats.totalReviews} reviews timed` : 'Time on focused review cards' },
          { label: 'Review streak', value: `${number.format(stats.streak)} d`, detail: 'Consecutive days with a review' },
        ]" :key="item.label" class="rounded-xl border border-interface/15 bg-ink-soft p-4">
          <p class="text-xs font-medium text-muted">{{ item.label }}</p>
          <p class="my-1 text-2xl font-semibold tabular-nums">{{ item.value }}</p>
          <p class="text-xs text-muted">{{ item.detail }}</p>
        </div>
      </div>
      <section class="rounded-xl border border-interface/15 bg-ink-soft p-5" aria-labelledby="known-progress">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h3 id="known-progress" class="font-semibold">Known words over time</h3>
          <div class="flex gap-1 text-xs">
            <button v-for="option in ranges" :key="option.days" type="button" :aria-pressed="option.days === range"
              class="rounded-md px-2 py-1" :class="option.days === range ? 'bg-accent text-white' : 'text-muted hover:bg-ink-lift'"
              @click="range = option.days; activePoint = undefined">{{ option.label }}</button>
          </div>
        </div>
        <template v-if="selected">
          <p class="my-3 text-sm text-muted"><strong class="tabular-nums text-paper">{{ number.format(selected.count) }}</strong> known · {{ date.format(selected.at) }}</p>
          <svg viewBox="0 0 600 160" class="block w-full text-accent" role="img"
            :aria-label="`Known words from ${date.format(graph.start)} to ${date.format(graph.end)}. Latest count ${stats.knownWords}.`"
            @pointermove="trackPoint" @pointerleave="activePoint = undefined">
            <path d="M 8 36 H 592 M 8 76 H 592 M 8 116 H 592 M 8 152 H 592" stroke="currentColor" stroke-opacity="0.15" />
            <path :d="`${graph.path} V 160 H 8 Z`" fill="currentColor" fill-opacity="0.08" />
            <path :d="graph.path" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" />
            <circle :cx="selected.x" :cy="selected.y" r="4" fill="currentColor" />
          </svg>
          <div class="mt-2 flex justify-between text-xs text-muted"><span>{{ date.format(graph.start) }}</span><span>{{ date.format(graph.end) }}</span></div>
        </template>
        <p v-else class="mt-4 text-sm text-muted">Open the Korean Reader extension popup while the desktop app is running, then refresh to see your known-word history.</p>
      </section>
      <section class="rounded-xl border border-interface/15 bg-ink-soft p-5" aria-labelledby="review-activity">
        <h3 id="review-activity" class="font-semibold">Reviews in the last 30 days</h3>
        <div class="mt-5 flex h-20 items-end gap-1" role="list" aria-label="Daily review counts">
          <div v-for="day in activity" :key="day.key" role="listitem" :aria-label="`${day.label}: ${day.count} reviews`"
            :title="`${day.label}: ${number.format(day.count)} reviews`" class="min-w-0 flex-1 rounded-t-sm"
            :class="day.count ? 'bg-accent/75' : 'bg-interface/15'" :style="{ height: `${Math.max(4, day.count / peak * 100)}%` }" />
        </div>
        <div class="mt-2 flex justify-between text-xs text-muted"><span>{{ activity[0]?.label }}</span><span>Today</span></div>
      </section>
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div v-for="item in [
          { label: 'Graduated cards', value: number.format(stats.learnedCards) },
          { label: 'Recall rate', value: stats.recallRate === null ? '—' : percent.format(stats.recallRate) },
          { label: 'Practice answers', value: number.format(stats.practiceAnswers) },
          { label: 'Practice accuracy', value: stats.practiceAccuracy === null ? '—' : percent.format(stats.practiceAccuracy) },
        ]" :key="item.label" class="rounded-xl border border-interface/15 bg-ink-soft p-4">
          <p class="text-xs font-medium text-muted" :title="item.label === 'Recall rate' ? 'Hard, Good or Easy ratings divided by all SRS ratings' : undefined">{{ item.label }}</p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ item.value }}</p>
        </div>
      </div>
    </template>
  </div>
</template>
