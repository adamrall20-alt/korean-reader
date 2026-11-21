<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { DesktopReviewSettings } from '../shared/api';

const emit = defineEmits<{
  (e: 'settings-saved', settings: DesktopReviewSettings): void;
}>();

const dailyNewLimit = ref(20);
const dailyReviewLimit = ref(200);
const loading = ref(false);
const saving = ref(false);
const savedNotice = ref('');
const errorMessage = ref('');

async function loadSettings() {
  const api = window.koreanReaderDesktop;
  if (!api?.getReviewSettings) return;
  loading.value = true;
  errorMessage.value = '';
  try {
    const settings = await api.getReviewSettings();
    dailyNewLimit.value = settings.dailyNewLimit;
    dailyReviewLimit.value = settings.dailyReviewLimit;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load settings.';
  } finally {
    loading.value = false;
  }
}

async function saveSettings() {
  const api = window.koreanReaderDesktop;
  if (!api?.saveReviewSettings) {
    errorMessage.value = 'Settings storage is unavailable.';
    return;
  }
  saving.value = true;
  savedNotice.value = '';
  errorMessage.value = '';
  try {
    const updated = await api.saveReviewSettings({
      dailyNewLimit: Number(dailyNewLimit.value),
      dailyReviewLimit: Number(dailyReviewLimit.value),
    });
    dailyNewLimit.value = updated.dailyNewLimit;
    dailyReviewLimit.value = updated.dailyReviewLimit;
    savedNotice.value = 'Settings saved.';
    emit('settings-saved', updated);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to save settings.';
  } finally {
    saving.value = false;
  }
}

function resetDefaults() {
  dailyNewLimit.value = 20;
  dailyReviewLimit.value = 200;
  savedNotice.value = '';
}

onMounted(() => {
  void loadSettings();
});
</script>

<template>
  <div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
    <section class="rounded-2xl border border-interface/15 bg-ink-soft p-6">
      <h2 class="text-base font-semibold text-paper">Daily Review Limits</h2>
      <p class="mt-1 text-xs text-muted">
        Control how many new cards and total reviews are shown each day. Changes apply immediately to your review queue.
      </p>

      <div
        v-if="errorMessage"
        role="alert"
        class="mt-4 rounded-xl border border-danger/30 bg-ink px-4 py-3 text-sm text-danger"
      >
        {{ errorMessage }}
      </div>

      <form class="mt-5 flex flex-col gap-5" @submit.prevent="saveSettings">
        <div class="flex flex-col gap-1.5">
          <label for="daily-new-limit" class="text-sm font-medium text-paper">
            New cards per day
          </label>
          <input
            id="daily-new-limit"
            v-model.number="dailyNewLimit"
            type="number"
            min="0"
            max="9999"
            :disabled="loading || saving"
            class="w-40 rounded-lg border border-interface/15 bg-ink px-3 py-2 text-sm text-paper focus:border-accent focus:outline-none"
          />
          <p class="text-xs text-muted">
            Limits how many unseen cards are introduced each day (default: 20).
          </p>
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="daily-review-limit" class="text-sm font-medium text-paper">
            Total reviews per day
          </label>
          <input
            id="daily-review-limit"
            v-model.number="dailyReviewLimit"
            type="number"
            min="0"
            max="9999"
            :disabled="loading || saving"
            class="w-40 rounded-lg border border-interface/15 bg-ink px-3 py-2 text-sm text-paper focus:border-accent focus:outline-none"
          />
          <p class="text-xs text-muted">
            Caps the total number of reviews completed per day across new, learning, and review cards (default: 200).
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-3 border-t border-interface/10 pt-4">
          <button
            type="submit"
            :disabled="loading || saving"
            class="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {{ saving ? 'Saving…' : 'Save Settings' }}
          </button>
          <button
            type="button"
            :disabled="loading || saving"
            class="rounded-lg border border-interface/15 px-3.5 py-2 text-xs font-medium text-muted transition-colors hover:bg-ink-lift hover:text-paper disabled:opacity-50"
            @click="resetDefaults"
          >
            Reset Defaults
          </button>
          <span v-if="savedNotice" role="status" class="text-xs font-medium text-accent">
            ✓ {{ savedNotice }}
          </span>
        </div>
      </form>
    </section>
  </div>
</template>
