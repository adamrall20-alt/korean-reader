<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { browser } from 'wxt/browser';

const code = ref('');
const linked = ref(false);
const busy = ref(false);
const error = ref('');

onMounted(async () => {
  try {
    const result = await browser.runtime.sendMessage({ type: 'desktop-known-link-status' });
    linked.value = Boolean(result?.linked);
  } catch {
    error.value = 'Could not read the Desktop link status.';
  }
});

async function updateLink() {
  busy.value = true;
  error.value = '';
  try {
    const result = await browser.runtime.sendMessage(linked.value
      ? { type: 'unlink-desktop-known' }
      : { type: 'link-desktop-known', code: code.value });
    if (!result?.ok) throw new Error('Could not update the link.');
    linked.value = result.linked;
    code.value = '';
  } catch {
    error.value = 'Could not update the link. Check that Desktop is open and the link code is current.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form class="mt-4 space-y-2 border-t border-interface/10 pt-4" @submit.prevent="updateLink">
    <label for="desktop-known-link" class="block text-sm font-medium">Link Known words to Desktop</label>
    <p v-if="linked" class="text-xs text-muted">Linked. Changes sync when Desktop is open.</p>
    <template v-else>
      <p class="text-xs text-muted">Open Desktop Settings and select Show Chrome link code.</p>
      <input id="desktop-known-link" v-model.trim="code" type="password" autocomplete="off"
        class="w-full rounded-lg border border-interface/15 bg-ink px-3 py-2 text-sm" />
    </template>
    <button :disabled="busy || (!linked && !code)" type="submit"
      class="rounded-lg border border-interface/15 px-3 py-2 text-xs font-medium disabled:opacity-50">
      {{ busy ? 'Working…' : linked ? 'Unlink Desktop' : 'Link Desktop' }}
    </button>
    <p v-if="error" role="alert" class="text-xs text-danger">{{ error }}</p>
  </form>
</template>
