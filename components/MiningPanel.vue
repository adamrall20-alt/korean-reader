<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import type { PingResponse } from '@/types/messages';

type ConnectionState = 'checking' | 'connected' | 'unavailable';

const connection = ref<ConnectionState>('checking');
const version = ref('');

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
        <span
          class="ml-auto rounded-full border border-white/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted"
        >
          Phase 1
        </span>
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

      <div class="rounded-2xl border border-white/10 bg-ink-soft p-4">
        <div class="flex items-baseline justify-between gap-3">
          <h2 class="text-sm font-medium">Vocabulary</h2>
          <span class="text-xs text-muted">0 words</span>
        </div>
        <p class="mt-2 text-xs leading-5 text-muted">
          Words you mine from Korean subtitles will appear here. Mining is added in Phase 4.
        </p>
        <button
          type="button"
          class="mt-4 w-full cursor-not-allowed rounded-xl bg-white/5 px-3 py-2.5 text-sm font-medium text-muted"
          disabled
          title="Anki synchronisation is added in Phase 5"
        >
          Sync to Anki
        </button>
      </div>

      <div class="rounded-2xl border border-white/10 bg-ink-soft p-4">
        <h2 class="text-sm font-medium">Next up</h2>
        <p class="mt-2 text-xs leading-5 text-muted">
          Phase 2 adds individually clickable words to the subtitle overlay.
        </p>
      </div>
    </section>

    <footer class="mt-auto border-t border-white/10 px-5 py-3">
      <p class="text-[11px] text-muted">
        v{{ version || '0.1.0' }} · Phase 1 subtitles
      </p>
    </footer>
  </main>
</template>
