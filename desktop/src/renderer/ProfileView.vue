<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import placeholderAvatar from '@/assets/penguin-face.png';
import type { DesktopStudyStats } from '../shared/api';
import { MAX_USERNAME_LENGTH, reviewProgress, vocabularyProgress } from '../shared/profile';

const stats = shallowRef<DesktopStudyStats>();
const username = ref('');
const draft = ref('');
const saving = ref(false);
const loading = ref(true);
const saved = ref(false);
const nameError = ref('');
const statsError = ref('');
const level = computed(() => stats.value ? reviewProgress(stats.value.totalReviews) : null);
const vocabulary = computed(() => vocabularyProgress(stats.value?.knownWords ?? null));
let unsubscribe: (() => void) | undefined;
let revision = 0;

async function loadStats() {
  const request = ++revision;
  try {
    const data = await window.koreanReaderDesktop!.getStudyStats();
    if (request === revision) {
      stats.value = data;
      statsError.value = '';
    }
  } catch {
    if (request === revision) statsError.value = 'Could not load study progress.';
  }
}

async function loadUsername() {
  try {
    username.value = await window.koreanReaderDesktop!.getProfileUsername();
    draft.value = username.value;
  } catch {
    nameError.value = 'Could not load your username.';
  } finally {
    loading.value = false;
  }
}

async function saveUsername() {
  if (saving.value) return;
  nameError.value = '';
  saved.value = false;
  saving.value = true;
  try {
    username.value = await window.koreanReaderDesktop!.saveProfileUsername(draft.value);
    draft.value = username.value;
    saved.value = true;
  } catch (error) {
    nameError.value = error instanceof Error ? error.message : 'Could not save your username.';
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void loadUsername();
  void loadStats();
  unsubscribe = window.koreanReaderDesktop?.onKnownHistoryUpdated?.(() => { void loadStats(); });
});
onBeforeUnmount(() => {
  revision += 1;
  unsubscribe?.();
});
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-4">
    <section class="flex flex-wrap items-center gap-5 rounded-2xl border border-interface/15 bg-ink-soft p-6">
      <div class="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border border-accent/30 bg-accent/10">
        <img :src="placeholderAvatar" alt="Placeholder profile picture" class="size-16 object-contain" />
      </div>
      <div class="min-w-0 flex-1">
        <h2 class="text-sm font-medium text-muted">Profile</h2>
        <p v-if="username" class="wrap-anywhere text-2xl font-semibold tracking-tight text-paper">{{ username }}</p>
        <form class="mt-3 space-y-1.5" @submit.prevent="saveUsername">
          <label for="profile-username" class="block text-xs font-medium text-muted">Username</label>
          <div class="flex flex-wrap items-center gap-2">
            <input id="profile-username" v-model="draft" :maxlength="MAX_USERNAME_LENGTH" :disabled="loading || saving"
              autocomplete="off" required class="w-56 rounded-lg border border-interface/15 bg-ink px-3 py-2 text-sm text-paper focus:border-accent"
              @input="saved = false" />
            <button type="submit" :disabled="loading || saving || !draft.trim() || draft.trim() === username"
              class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {{ saving ? 'Saving…' : 'Save username' }}
            </button>
            <span v-if="saved" role="status" class="text-xs text-accent">Saved</span>
          </div>
          <p v-if="nameError" role="alert" class="text-sm text-danger">{{ nameError }}</p>
        </form>
      </div>
    </section>

    <p v-if="statsError" role="alert" class="rounded-xl border border-danger/30 bg-ink-soft p-4 text-sm text-danger">{{ statsError }}</p>
    <div v-else-if="stats && level" class="grid gap-4 sm:grid-cols-2">
      <section class="space-y-3 rounded-2xl border border-interface/15 bg-ink-soft p-5">
        <h3 class="text-sm font-medium text-muted">Review level</h3>
        <p class="text-3xl font-semibold text-paper">Level {{ level.level.toLocaleString() }}</p>
        <progress :value="level.earned" :max="level.required" aria-label="XP toward the next level"
          class="h-2 w-full align-middle accent-accent" />
        <p class="text-sm text-muted">{{ level.earned.toLocaleString() }} / {{ level.required.toLocaleString() }} XP to level {{ level.level + 1 }}</p>
        <p class="text-xs text-muted">{{ stats.totalReviews.toLocaleString() }} lifetime XP · 1 XP per SRS review</p>
      </section>

      <section class="space-y-3 rounded-2xl border border-interface/15 bg-ink-soft p-5">
        <h3 class="text-sm font-medium text-muted">Vocabulary rank</h3>
        <template v-if="vocabulary && stats.knownWords !== null">
          <div>
            <p lang="ko" class="text-3xl font-semibold text-paper">{{ vocabulary.rank.name }}</p>
            <p class="mt-1 text-sm text-muted">{{ vocabulary.rank.translation }}</p>
          </div>
          <template v-if="vocabulary.next">
            <progress :value="stats.knownWords - vocabulary.rank.minimum" :max="vocabulary.next.minimum - vocabulary.rank.minimum"
              aria-label="Known words toward the next rank" class="h-2 w-full align-middle accent-accent" />
            <p class="text-sm text-muted">{{ stats.knownWords.toLocaleString() }} words known · next rank at {{ vocabulary.next.minimum.toLocaleString() }}</p>
          </template>
          <p v-else class="text-sm text-muted">{{ stats.knownWords.toLocaleString() }} words known · highest rank reached</p>
        </template>
        <p v-else class="text-sm text-muted">Link Chrome Known words in Settings, or import Known word history in Stats, to see your rank.</p>
      </section>
    </div>
    <p v-else role="status" class="text-sm text-muted">Loading study progress…</p>
  </div>
</template>
