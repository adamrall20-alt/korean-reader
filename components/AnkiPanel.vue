<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import {
  ANKI_DEFAULT_FIELDS, ANKI_FIELD_ROLES, DEFAULT_ANKI_SETTINGS,
  type AnkiFieldRole, type AnkiMessage, type AnkiResponse, type AnkiSettings, type AnkiSyncResult,
} from '@/types/anki';

const props = defineProps<{ headwords?: string[] }>();
const emit = defineEmits<{ synced: [] }>();
const settings = ref<AnkiSettings>({ ...DEFAULT_ANKI_SETTINGS, fields: { ...ANKI_DEFAULT_FIELDS } });
const decks = ref<string[]>([]);
const models = ref<string[]>([]);
const fields = ref<string[]>([]);
const connected = ref(false);
const busy = ref(false);
const error = ref('');
const notice = ref('');
const results = ref<AnkiSyncResult[]>([]);
const origin = browser.runtime.getURL?.('/')?.replace(/\/$/, '');
const requiredFields = new Set<AnkiFieldRole>(['word', 'sentence', 'definition']);
const validMapping = computed(() => {
  const mapped = Object.values(settings.value.fields).filter(Boolean);
  return [...requiredFields].every((role) => settings.value.fields[role]) &&
    mapped.every((field) => fields.value.includes(field)) && new Set(mapped).size === mapped.length;
});
const configured = computed(() => connected.value && !!settings.value.deckName && validMapping.value);
const labels = { created: 'Created', updated: 'Sentence added', existing: 'Already in Anki', failed: 'Failed' };

async function request(message: AnkiMessage) {
  const result: AnkiResponse | undefined = await browser.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error ?? 'AnkiConnect did not respond.');
  return result;
}

async function run(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    await action();
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'AnkiConnect request failed.';
  } finally {
    busy.value = false;
  }
}

function connection() {
  const { port, apiKey } = settings.value;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Enter a valid local port.');
  return { port, apiKey };
}

async function readFields() {
  fields.value = [];
  if (!settings.value.modelName) return;

  const result = await request({ type: 'get-anki-fields', ...connection(), modelName: settings.value.modelName });
  fields.value = result.fields ?? [];
  for (const role of ANKI_FIELD_ROLES) {
    const mapped = settings.value.fields[role];
    if (!fields.value.includes(mapped)) {
      const defaultField = ANKI_DEFAULT_FIELDS[role];
      settings.value.fields[role] = fields.value.includes(defaultField) ? defaultField : '';
    }
  }
}

async function loadConnection(requestPermission: boolean) {
  connected.value = false;
  const result = await request({ type: 'connect-anki', ...connection(), requestPermission });
  decks.value = result.decks ?? [];
  models.value = result.models ?? [];
  if (!decks.value.includes(settings.value.deckName)) settings.value.deckName = '';
  if (!models.value.includes(settings.value.modelName)) settings.value.modelName = '';
  connected.value = true;
  await readFields();
}

function changeModel() {
  settings.value.fields = { ...ANKI_DEFAULT_FIELDS };
  void run(readFields);
}

function configuration(): AnkiSettings {
  return { ...settings.value, fields: { ...settings.value.fields } };
}

function saveDefaults() {
  void run(async () => {
    await request({ type: 'save-anki-settings', settings: configuration() });
    notice.value = 'Anki defaults saved.';
  });
}

function syncSelected() {
  const headwords = props.headwords;
  if (!headwords?.length || !configured.value) return;

  results.value = [];
  void run(async () => {
    const result = await request({ type: 'sync-anki', settings: configuration(), headwords: [...headwords] });
    results.value = result.results ?? [];
    emit('synced');
  });
}

onMounted(() => {
  void run(async () => {
    const response = await request({ type: 'get-anki-settings' });
    if (response.settings) {
      settings.value = { ...response.settings, fields: { ...response.settings.fields } };
    }
    if (props.headwords && settings.value.deckName) await loadConnection(false);
  });
});
</script>

<template>
  <div class="space-y-3 text-sm">
    <div class="flex items-center justify-between gap-2">
      <span class="text-xs" :class="connected ? 'text-accent' : 'text-muted'" role="status">
        {{ connected ? 'Anki connected' : busy ? 'Connecting…' : 'Anki disconnected' }}
      </span>
      <button type="button" :disabled="busy" class="rounded-lg border border-white/15 px-2 py-1 text-xs disabled:opacity-50" @click="run(() => loadConnection(true))">
        {{ connected ? 'Refresh Anki' : 'Connect Anki' }}
      </button>
    </div>

    <details :open="headwords === undefined">
      <summary class="cursor-pointer text-xs text-muted">Connection settings</summary>
      <fieldset :disabled="busy" class="mt-2 grid gap-2">
        <label class="grid gap-1 text-xs">
          Local port
          <input v-model.number="settings.port" type="number" min="1" max="65535" class="rounded-lg border border-white/15 bg-ink px-2 py-1" @input="connected = false" />
        </label>
        <label class="grid gap-1 text-xs">
          AnkiConnect API key (optional)
          <input v-model.trim="settings.apiKey" type="password" autocomplete="off" class="rounded-lg border border-white/15 bg-ink px-2 py-1" @input="connected = false" />
        </label>
        <p v-if="origin" class="break-all text-xs text-muted">Extension origin {{ origin }}</p>
      </fieldset>
    </details>

    <fieldset v-if="connected" :disabled="busy" class="grid gap-2">
      <label class="grid gap-1 text-xs">
        Deck
        <select v-model="settings.deckName" class="min-w-0 rounded-lg border border-white/15 bg-ink px-2 py-1">
          <option value="">Choose deck</option>
          <option v-for="deck in decks" :key="deck">{{ deck }}</option>
        </select>
      </label>
      <label class="grid gap-1 text-xs">
        Note type
        <select v-model="settings.modelName" class="min-w-0 rounded-lg border border-white/15 bg-ink px-2 py-1" @change="changeModel">
          <option value="">Choose note type</option>
          <option v-for="model in models" :key="model">{{ model }}</option>
        </select>
      </label>
      <details v-if="fields.length" :open="!validMapping">
        <summary class="cursor-pointer text-xs text-muted">Field mapping</summary>
        <div class="mt-2 grid gap-2">
          <label v-for="role in ANKI_FIELD_ROLES" :key="role" class="grid grid-cols-2 items-center gap-2 text-xs">
            {{ ANKI_DEFAULT_FIELDS[role] }}
            <select v-model="settings.fields[role]" class="min-w-0 rounded-lg border border-white/15 bg-ink px-2 py-1">
              <option value="">{{ requiredFields.has(role) ? 'Choose field' : 'Optional' }}</option>
              <option v-for="field in fields" :key="field">{{ field }}</option>
            </select>
          </label>
        </div>
      </details>
      <button type="button" :disabled="!configured" class="justify-self-start rounded-lg border border-white/15 px-2 py-1 text-xs disabled:opacity-50" @click="saveDefaults">
        Save defaults
      </button>
    </fieldset>

    <button
      v-if="headwords"
      type="button"
      :disabled="busy || !configured || !headwords.length"
      class="w-full rounded-lg bg-accent px-3 py-2 font-medium text-white disabled:opacity-50"
      @click="syncSelected"
    >{{ busy && connected ? 'Working…' : 'Sync to Anki' }}<template v-if="headwords.length"> ({{ headwords.length }})</template></button>

    <p v-if="error" role="alert" class="text-xs text-red-300">{{ error }}</p>
    <p v-if="notice" role="status" class="text-xs text-accent">{{ notice }}</p>
    <ul v-if="results.length" aria-label="Anki sync results" class="max-h-32 space-y-2 overflow-auto text-xs" aria-live="polite">
      <li v-for="result in results" :key="result.headword" :class="result.status === 'failed' ? 'text-red-300' : 'text-paper'">
        <span lang="ko">{{ result.headword }}</span> · {{ labels[result.status] }}
        <p v-if="result.message" class="mt-1">{{ result.message }}</p>
      </li>
    </ul>
  </div>
</template>
