<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue';
import { createDefinitionTranslator, getDefinitionTranslatorApi, translateDefinitionList } from '@/services/korean/translation';
import { browser } from 'wxt/browser';
import { sameVocabularyContext, type VocabularyContext, type VocabularyMessage, type VocabularyResponse } from '@/types/vocabulary';
import type { DictionaryEntry } from '@/types/messages';

const props = defineProps<{
  entry: DictionaryEntry | null;
  originalForm: string;
  loading: boolean;
  error: string | null;
  style: CSSProperties;
  miningContext?: VocabularyContext;
  savedContexts?: VocabularyContext[];
}>();

const emit = defineEmits<{
  close: [];
  resize: [];
}>();

const translatorApi = getDefinitionTranslatorApi();

const popupElement = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | undefined;

onMounted(() => {
  if (popupElement.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => emit('resize'));
    resizeObserver.observe(popupElement.value);
  }
});
onBeforeUnmount(() => resizeObserver?.disconnect());

const translatedDefinitions = ref<string[]>([]);
const translationStatus = ref('');
const translating = ref(false);
let translationRequest: AbortController | undefined;

function resetTranslation() {
  translationRequest?.abort();
  translationRequest = undefined;
  translatedDefinitions.value = [];
  translationStatus.value = '';
  translating.value = false;
}

watch(() => props.entry, resetTranslation);
onBeforeUnmount(resetTranslation);

async function translateDefinitions() {
  const definitions = props.entry?.koreanDefinitions.slice(0, 3);
  if (!translatorApi || !definitions?.length || translating.value) return;

  const request = new AbortController();
  translationRequest = request;
  const { signal } = request;
  translating.value = true;
  translationStatus.value = 'Preparing Chrome translation. The first use may download a language pack.';
  let translator: Awaited<ReturnType<typeof createDefinitionTranslator>> | undefined;

  try {
    translator = await createDefinitionTranslator(signal);
    if (signal.aborted) return;
    translationStatus.value = 'Translating definitions…';
    const results = await translateDefinitionList(translator, definitions, signal);
    if (signal.aborted) return;
    translatedDefinitions.value = results;
    translationStatus.value = '';
  } catch {
    if (!signal.aborted) {
      translationStatus.value = 'Chrome could not translate these definitions. You can try again.';
    }
  } finally {
    translator?.destroy();
    if (translationRequest === request) {
      translationRequest = undefined;
      translating.value = false;
    }
  }
}

const mining = ref(false);
const miningOutcome = ref<VocabularyResponse>();
const contextAlreadySaved = computed(() => {
  const current = props.miningContext;
  return current && props.savedContexts?.some((context) => sameVocabularyContext(context, current));
});

async function saveWord() {
  const { entry, miningContext } = props;
  if (!entry || !miningContext || mining.value || miningOutcome.value?.ok || contextAlreadySaved.value) return;

  mining.value = true;
  miningOutcome.value = undefined;
  try {
    const response: VocabularyResponse | undefined = await browser.runtime.sendMessage({
      type: 'mine-word',
      entry,
      context: miningContext,
      machineDefinitions: translatedDefinitions.value,
    } satisfies VocabularyMessage);
    if (props.miningContext === miningContext) {
      miningOutcome.value = response ?? { ok: false, error: 'Could not save the word.' };
    }
  } catch {
    if (props.miningContext === miningContext) {
      miningOutcome.value = { ok: false, error: 'Could not save the word. Try again.' };
    }
  } finally {
    if (props.miningContext === miningContext) mining.value = false;
  }
}

watch(() => props.miningContext, () => {
  mining.value = false;
  miningOutcome.value = undefined;
});
</script>

<template>
  <aside
    ref="popupElement"
    class="kr-dictionary-popup"
    :style="style"
    role="dialog"
    aria-label="Dictionary definition"
    @click.stop
  >
    <button type="button" class="kr-dictionary-close" aria-label="Close" @click="$emit('close')">
      ×
    </button>

    <p class="kr-dictionary-original">{{ originalForm }}</p>

    <p v-if="loading" class="kr-dictionary-message">Looking up definition…</p>
    <p v-else-if="error" class="kr-dictionary-message kr-dictionary-error">{{ error }}</p>
    <template v-else-if="entry">
      <div class="kr-dictionary-heading">
        <h2>{{ entry.headword }}</h2>
        <span v-if="entry.partOfSpeech">{{ entry.partOfSpeech }}</span>
      </div>
      <p v-if="entry.pronunciation" class="kr-dictionary-pronunciation">
        {{ entry.pronunciation }}
      </p>
      <p v-if="entry.hanja?.length" class="kr-dictionary-pronunciation">
        Hanja {{ entry.hanja.join(', ') }}
      </p>
      <p v-if="entry.conjugations?.length" class="kr-dictionary-pronunciation">
        Forms {{ entry.conjugations.slice(0, 3).join(', ') }}
      </p>
      <section v-if="entry.definitions.length > 0" class="kr-dictionary-section">
        <h3>English</h3>
        <ol class="kr-dictionary-definitions">
          <li lang="en" v-for="definition in entry.definitions.slice(0, 3)" :key="definition">
            {{ definition }}
          </li>
        </ol>
      </section>
      <section v-else-if="entry.koreanDefinitions.length > 0" class="kr-dictionary-section">
        <h3>Korean definition</h3>
        <ol class="kr-dictionary-definitions" lang="ko">
          <li v-for="definition in entry.koreanDefinitions.slice(0, 3)" :key="definition">
            {{ definition }}
          </li>
        </ol>
        <button
          v-if="translatorApi && !translatedDefinitions.length"
          type="button"
          class="kr-translate-button"
          :disabled="translating"
          @click="translateDefinitions"
        >
          Translate to English
        </button>
        <p v-if="translationStatus" class="kr-dictionary-message" role="status">
          {{ translationStatus }}
        </p>
        <p v-if="!translatorApi" class="kr-dictionary-message">
          On-device translation is unavailable in this browser.
        </p>
      </section>
      <section v-if="translatedDefinitions.length" class="kr-dictionary-section" lang="en">
        <h3>Machine translation</h3>
        <ol class="kr-dictionary-definitions">
          <li v-for="(definition, index) in translatedDefinitions" :key="index">{{ definition }}</li>
        </ol>
      </section>
      <section v-if="entry.examples.length > 0" class="kr-dictionary-section kr-dictionary-examples">
        <h3>Examples</h3>
        <p v-for="example in entry.examples.slice(0, 2)" :key="example">{{ example }}</p>
      </section>
      <div v-if="miningContext" class="kr-mining-actions">
        <p v-if="miningOutcome?.ok || contextAlreadySaved" role="status">
          {{ miningOutcome?.ok && miningOutcome.outcome === 'mined' ? '✓ Mined'
            : miningOutcome?.ok && miningOutcome.outcome === 'added' ? '✓ Sentence saved'
            : 'Already mined · Sentence saved' }}
        </p>
        <template v-else>
          <p v-if="savedContexts?.length" class="kr-dictionary-message">Already mined</p>
          <button
            type="button"
            class="kr-mine-button"
            :disabled="mining || translating"
            @click="saveWord"
          >
            {{ mining ? 'Saving…' : savedContexts?.length ? 'Save Sentence' : 'Mine Word' }}
          </button>
          <p v-if="miningOutcome && !miningOutcome.ok" class="kr-dictionary-error" role="alert">
            {{ miningOutcome.error }}
          </p>
        </template>
      </div>
    </template>
  </aside>
</template>
