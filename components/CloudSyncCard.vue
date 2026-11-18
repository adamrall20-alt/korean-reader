<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import type { AccountAction, AccountResponse, AccountView } from '@/types/account';

const emit = defineEmits<{ update: [view: AccountView] }>();
const view = ref<AccountView>();
const busy = ref(false);
const message = ref('');
const syncDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const primaryButton = 'rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:brightness-90';
const secondaryButton = 'rounded-lg border border-interface/20 px-4 py-2 text-sm font-medium hover:bg-interface/5';

async function request(action: Exclude<AccountAction, 'edit'>) {
  if (busy.value) return;
  busy.value = true;
  message.value = '';
  try {
    const response: AccountResponse = await browser.runtime.sendMessage({
      type: 'phase10-account', action,
    });
    if (!response.ok) throw new Error(response.error);
    view.value = response.view;
    emit('update', response.view);
    message.value = response.view.notice ?? '';
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Account request failed.';
  } finally {
    busy.value = false;
  }
}

onMounted(() => void request('sync'));
</script>

<template>
  <section aria-labelledby="account-heading" class="grid gap-5 rounded-xl border border-interface/10 bg-ink-soft p-5">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div class="flex min-w-0 items-start gap-3">
        <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-accent/15 text-paper">
          <svg aria-hidden="true" class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 18a4.5 4.5 0 1 1 .75-8.94 6 6 0 0 1 11.49 2.28A3.4 3.4 0 0 1 18 18H7Z" />
          </svg>
        </span>
        <div class="min-w-0">
          <h2 id="account-heading" class="font-semibold">Cloud sync</h2>
          <p v-if="view?.email" class="mt-1 text-sm wrap-anywhere text-muted">Google account · {{ view.email }}</p>
          <p v-else class="mt-1 text-sm text-muted">Sync your known words and progress history across Chrome profiles.</p>
        </div>
      </div>
      <button v-if="view?.email" type="button" :class="secondaryButton" :disabled="busy" class="disabled:opacity-50" @click="request('sign-out')">Sign out</button>
      <button v-else-if="view || !busy" type="button" :class="primaryButton" :disabled="busy" class="disabled:opacity-50" @click="request('sign-in')">Sign in with Google</button>
    </header>

    <template v-if="view?.email">
      <dl v-if="view.imported" class="grid overflow-hidden rounded-lg border border-interface/10 bg-ink divide-y divide-interface/10 sm:grid-cols-[1fr_1fr_1.4fr] sm:divide-x sm:divide-y-0">
        <div class="grid content-start gap-1 px-4 py-3">
          <dt class="text-sm text-muted">Account known words</dt>
          <dd class="text-xl font-semibold tabular-nums">{{ view.count.toLocaleString() }}</dd>
        </div>
        <div class="grid content-start gap-1 px-4 py-3">
          <dt class="text-sm text-muted">Pending changes</dt>
          <dd class="text-xl font-semibold tabular-nums">{{ view.pending.toLocaleString() }}</dd>
        </div>
        <div class="grid content-start gap-1 px-4 py-3">
          <dt class="text-sm text-muted">Last successful sync</dt>
          <dd class="min-h-7 content-center text-sm font-medium">
            <time v-if="view.lastSync !== null" :datetime="new Date(view.lastSync).toISOString()">{{ syncDate.format(view.lastSync) }}</time>
            <span v-else>Never synced</span>
          </dd>
        </div>
      </dl>
      <p v-else class="rounded-lg border border-interface/10 bg-ink px-4 py-3 text-sm text-muted">
        Import your known words and progress history from this Chrome profile to get started.
      </p>
      <fieldset :disabled="busy" class="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-interface/10 pt-4 disabled:opacity-50">
        <legend class="sr-only">Cloud sync actions</legend>
        <button type="button" :class="view.imported ? secondaryButton : primaryButton" @click="request('import')">Import this profile’s known words</button>
        <button type="button" :class="view.imported ? primaryButton : secondaryButton" @click="request('sync')">Sync now</button>
      </fieldset>
    </template>

    <div role="status" class="text-sm text-muted" :class="{ 'sr-only': !busy && !message }">
      {{ busy ? 'Working…' : message }}
    </div>
  </section>
</template>
