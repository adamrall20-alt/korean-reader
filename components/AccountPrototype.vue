<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import type { AccountAction, AccountResponse, AccountView } from '@/types/account';

const emit = defineEmits<{ update: [view: AccountView] }>();
const view = ref<AccountView>();
const busy = ref(false);
const message = ref('');
const word = ref('');

async function request(action: AccountAction, known?: boolean) {
  if (busy.value) return;
  busy.value = true;
  message.value = '';
  try {
    const response: AccountResponse = await browser.runtime.sendMessage({
      type: 'phase10-account', action, word: word.value, known,
    });
    if (!response.ok) throw new Error(response.error);
    view.value = response.view;
    emit('update', response.view);
    message.value = response.view.notice ?? '';
    if (action === 'edit') word.value = '';
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Account request failed.';
  } finally {
    busy.value = false;
  }
}

onMounted(() => void request('sync'));
</script>

<template>
  <section aria-labelledby="account-heading" class="grid gap-3 rounded-xl border border-interface/10 bg-ink-soft p-5">
    <h2 id="account-heading" class="font-semibold">Account sync prototype</h2>
    <fieldset :disabled="busy" class="grid gap-3 disabled:opacity-70">
      <template v-if="view?.email">
        <p class="text-sm">{{ view.email }}</p>
        <p v-if="view.imported" class="text-sm">{{ view.count.toLocaleString() }} known words · {{ view.pending }} pending</p>
        <p v-if="view.lastSync" class="text-xs text-muted">Last sync {{ new Date(view.lastSync).toLocaleString() }}</p>
        <div class="flex flex-wrap gap-3">
          <button type="button" class="underline" @click="request('import')">Import this profile’s known words</button>
          <button type="button" class="underline" @click="request('sync')">Sync now</button>
          <button type="button" class="underline" @click="request('sign-out')">Sign out</button>
        </div>
        <form v-if="view.imported" class="flex flex-wrap items-end gap-3" @submit.prevent="request('edit', true)">
          <label class="grid gap-1 text-sm">
            Test headword
            <input v-model="word" required class="rounded border border-interface/25 bg-ink px-2 py-1" />
          </label>
          <button type="submit" class="underline" :disabled="!word.trim()">Mark known</button>
          <button type="button" class="underline" :disabled="!word.trim()" @click="request('edit', false)">Mark unknown</button>
        </form>
      </template>
      <button v-else type="button" class="justify-self-start underline" @click="request('sign-in')">Sign in with Google</button>
    </fieldset>
    <p v-if="busy" class="text-sm text-muted" role="status">Working…</p>
    <p v-if="message" class="text-sm" role="status">{{ message }}</p>
  </section>
</template>
