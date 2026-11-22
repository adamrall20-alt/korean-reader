<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import type { WifiSyncState } from '../shared/api';

const sync = ref<WifiSyncState>();
const chromeCode = ref('');
const busy = ref(false);
const status = ref('');
const error = ref('');
let timer: ReturnType<typeof setInterval> | undefined;
const api = window.koreanReaderDesktop!;

async function refresh() {
  sync.value = await api.getWifiSyncState();
}

async function run(action: () => Promise<void>) {
  busy.value = true;
  error.value = '';
  status.value = '';
  try {
    await action();
    await refresh();
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Wi-Fi sync failed.';
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  void run(refresh);
  timer = setInterval(() => { void refresh().catch(() => {}); }, 1000);
});

onUnmounted(() => clearInterval(timer));
</script>

<template>
  <section class="rounded-2xl border border-interface/15 bg-ink-soft p-6">
    <h2 class="text-base font-semibold text-paper">Sync over Wi-Fi</h2>
    <p class="mt-1 text-xs text-muted">Pair once, then sync while Korean Reader is running on both devices on the same network.</p>

    <div v-if="sync?.paired" class="mt-4 space-y-3">
      <p class="text-sm text-paper">
        {{ sync.paired.name }} <span class="text-muted">· {{ sync.online ? 'Online' : 'Offline' }}</span>
      </p>
      <label class="flex items-center gap-2 text-sm text-paper">
        <input type="checkbox" :checked="sync.automatic" :disabled="busy"
          @change="run(() => api.setWifiAutomatic(($event.target as HTMLInputElement).checked))" />
        Sync automatically
      </label>
      <div class="flex flex-wrap gap-2">
        <button type="button" :disabled="busy || sync.syncing"
          class="rounded-lg bg-accent px-3 py-2 text-sm text-white disabled:opacity-50"
          @click="run(() => api.syncWifiNow())">
          {{ sync.syncing ? 'Syncing…' : 'Sync now' }}
        </button>
        <button type="button" :disabled="busy || sync.syncing"
          class="rounded-lg border border-interface/15 px-3 py-2 text-sm text-paper disabled:opacity-50"
          @click="run(() => api.forgetWifiDevice())">Forget device</button>
      </div>
      <p v-if="sync.lastSyncAt" role="status" class="text-xs text-muted">
        Last synced {{ new Date(sync.lastSyncAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }}
      </p>
    </div>

    <div v-else-if="sync?.pairing" class="mt-4 space-y-3">
      <p class="text-sm text-muted">Select Find nearby devices on the other computer too. Then choose it below and compare the six digits on both screens.</p>
      <ul v-if="sync.nearby.length" class="space-y-2">
        <li v-for="device in sync.nearby" :key="device.id">
          <button type="button" :disabled="busy"
            class="rounded-lg border border-interface/15 px-3 py-2 text-sm text-paper disabled:opacity-50"
            @click="run(() => api.pairWifiDevice(device.id))">Pair with {{ device.name }}</button>
        </li>
      </ul>
      <p v-else role="status" class="text-xs text-muted">Looking for nearby devices…</p>
      <button type="button" class="rounded-lg border border-interface/15 px-3 py-2 text-sm text-paper"
        @click="run(() => api.stopWifiDiscovery())">Stop looking</button>
    </div>

    <button v-else type="button" :disabled="busy"
      class="mt-4 rounded-lg bg-accent px-3 py-2 text-sm text-white disabled:opacity-50"
      @click="run(() => api.findWifiDevices())">Find nearby devices</button>
    <p v-if="status" role="status" class="mt-2 text-sm text-accent">{{ status }}</p>
    <p v-if="error || sync?.error" role="alert" class="mt-2 text-sm text-danger">{{ error || sync?.error }}</p>
    <div class="mt-5 border-t border-interface/10 pt-4">
      <h3 class="text-sm font-semibold text-paper">Chrome Known words</h3>
      <p class="mb-2 mt-1 text-xs text-muted">Enter this code in Chrome’s Korean Reader settings to link Known words on this computer.</p>
      <div class="flex flex-wrap gap-2">
        <button type="button" :disabled="busy" class="rounded-lg border border-interface/15 px-3 py-2 text-sm text-paper"
          @click="run(async () => { chromeCode = chromeCode ? '' : await api.getKnownWordsCode(); })">
          {{ chromeCode ? 'Hide Chrome link code' : 'Show Chrome link code' }}
        </button>
        <button v-if="chromeCode" type="button" :disabled="busy" class="rounded-lg border border-interface/15 px-3 py-2 text-sm text-paper"
          @click="run(async () => { chromeCode = await api.getKnownWordsCode(true); status = 'Previous Chrome links have been revoked.'; })">Reset Chrome links</button>
      </div>
      <input v-if="chromeCode" :value="chromeCode" readonly aria-label="Chrome link code"
        class="mt-2 w-full rounded-lg border border-interface/15 bg-ink p-2 text-sm text-paper" />
    </div>
  </section>
</template>
