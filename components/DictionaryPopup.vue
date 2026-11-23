<script setup lang="ts">
import ReaderIcon from './ReaderIcon.vue';
import { computed, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue';
import { createDefinitionTranslator, getDefinitionTranslatorApi, translateDefinitionList } from '@/services/korean/translation';
import { browser } from 'wxt/browser';
import { sameVocabularyContext, type VocabularyContext, type VocabularyMessage, type VocabularyResponse } from '@/types/vocabulary';
import type { DictionaryEntry, JapaneseLookupMatch } from '@/types/messages';

const props = defineProps<{
  entry: DictionaryEntry | null;
  originalForm: string;
  loading: boolean;
  error: string | null;
  style: CSSProperties;
  miningContext?: VocabularyContext;
  prepareMine?: () => Promise<Partial<Pick<VocabularyContext, 'image'>>>;
  recordAudio?: () => Promise<string | undefined>;
  savedContexts?: VocabularyContext[];
  isKnown?: boolean;
  japaneseMatches?: JapaneseLookupMatch[];
}>();

const emit = defineEmits<{
  close: [];
  resize: [];
}>();

const translatorApi = getDefinitionTranslatorApi();
const selectedLexeme = ref('');
watch(() => props.japaneseMatches, () => { selectedLexeme.value = ''; }, { flush: 'sync' });
const selectedMatch = computed(() => props.japaneseMatches?.find(({ entry }) => entry.japanese?.id === selectedLexeme.value)
  ?? props.japaneseMatches?.[0]);
const entry = computed(() => selectedMatch.value?.entry ?? props.entry);
const savedContexts = computed(() => selectedMatch.value ? selectedMatch.value.savedContexts : props.savedContexts);
const isKnown = computed(() => selectedMatch.value?.isKnown ?? props.isKnown);
const language = computed(() => entry.value?.japanese ? 'ja' : 'ko');

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

const selectedDefinitions = ref<number[]>([]);
watch(entry, (entry) => {
  resetTranslation();
  const definitions = entry?.definitions.length ? entry.definitions : entry?.koreanDefinitions ?? [];
  selectedDefinitions.value = definitions.length === 1 ? [0] : [];
}, { immediate: true });

function toggleDefinition(index: number) {
  selectedDefinitions.value = selectedDefinitions.value.includes(index)
    ? selectedDefinitions.value.filter((selected) => selected !== index)
    : [...selectedDefinitions.value, index];
}
onBeforeUnmount(resetTranslation);

async function translateDefinitions() {
  const definitions = entry.value?.koreanDefinitions;
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
const recording = ref(false);
const audioUnavailable = ref(false);
const miningOutcome = ref<VocabularyResponse>();
const savedContext = computed(() => {
  const current = props.miningContext;
  return current && savedContexts.value?.find((context) => sameVocabularyContext(context, current));
});

const canAddAudio = computed(() => !!savedContext.value && !savedContext.value.audio && !!props.recordAudio);
const contextAlreadySaved = computed(() => !!savedContext.value && !canAddAudio.value);

const markingKnown = ref(false);
const knownOutcome = ref<VocabularyResponse>();

watch(entry, () => {
  markingKnown.value = false;
  knownOutcome.value = undefined;
});
watch(isKnown, (known) => {
  if (!known && knownOutcome.value?.ok) knownOutcome.value = undefined;
});

async function markKnown() {
  const word = entry.value;
  if (!word || isKnown.value || knownOutcome.value?.ok || markingKnown.value) return;

  markingKnown.value = true;
  knownOutcome.value = undefined;
  try {
    const response: VocabularyResponse | undefined = await browser.runtime.sendMessage({
      type: 'mark-word-known',
      headword: word.headword,
      ...(word.japanese ? { language: 'ja', japanese: word.japanese } : {}),
    } satisfies VocabularyMessage);
    if (entry.value === word) {
      knownOutcome.value = response ?? { ok: false, error: 'Could not mark the word as known.' };
    }
  } catch {
    if (entry.value === word) {
      knownOutcome.value = { ok: false, error: 'Could not mark the word as known. Try again.' };
    }
  } finally {
    if (entry.value === word) markingKnown.value = false;
  }
}

async function saveWord() {
  const { miningContext } = props;
  const word = entry.value;
  if (!word || !miningContext || mining.value || miningOutcome.value?.ok || contextAlreadySaved.value || (!savedContexts.value?.length && !selectedDefinitions.value.length)) return;

  mining.value = true;
  miningOutcome.value = undefined;
  const indices = [...selectedDefinitions.value].sort((a, b) => a - b);
  const selectedEntry = savedContexts.value?.length ? word : {
    ...word,
    definitions: word.definitions.filter((_, index) => indices.includes(index)),
    koreanDefinitions: word.definitions.length ? [] : word.koreanDefinitions.filter((_, index) => indices.includes(index)),
  };
  const machineDefinitions = word.definitions.length ? [] : translatedDefinitions.value.filter((_, index) => indices.includes(index));
  audioUnavailable.value = false;
  try {
    const languageFields = word.japanese ? { language: 'ja' as const } : {};
    if (word.japanese && !savedContext.value) {
      const initial: VocabularyResponse | undefined = await browser.runtime.sendMessage({
        type: 'mine-word', ...languageFields, entry: selectedEntry, context: miningContext, machineDefinitions,
      } satisfies VocabularyMessage);
      if (!initial?.ok) throw new Error(initial?.error ?? 'Could not save the word.');
      if (props.miningContext === miningContext && entry.value === word) miningOutcome.value = initial;
      if (!props.prepareMine && !props.recordAudio) return;
    }
    const media = await (word.japanese ? props.prepareMine?.().catch(() => undefined) : props.prepareMine?.());
    if (props.miningContext !== miningContext || entry.value !== word) return;
    let audio: string | undefined;
    if (props.recordAudio) {
      recording.value = true;
      try {
        audio = await props.recordAudio();
      } catch {
        // A recording failure must still allow a new sentence to be saved.
      }
      if (props.miningContext === miningContext) {
        recording.value = false;
        audioUnavailable.value = !audio;
      }
    }
    if (entry.value !== word || (savedContext.value && !audio && props.miningContext === miningContext) ||
        (word.japanese && miningOutcome.value?.ok && !media?.image && !audio)) return;
    const response: VocabularyResponse | undefined = await browser.runtime.sendMessage({
      type: 'mine-word',
      ...(word.japanese ? { language: 'ja' } : {}),
      entry: selectedEntry,
      context: { ...miningContext, ...media, ...(audio ? { audio } : {}) },
      machineDefinitions,
    } satisfies VocabularyMessage);
    if (props.miningContext === miningContext && entry.value === word) {
      if (!word.japanese || !miningOutcome.value?.ok || (response?.ok && response.outcome !== 'existing')) {
        miningOutcome.value = response ?? { ok: false, error: 'Could not save the word.' };
      }
    }
  } catch (error) {
    if (props.miningContext === miningContext && entry.value === word && !miningOutcome.value?.ok) {
      miningOutcome.value = { ok: false, error: word.japanese && error instanceof Error ? error.message : 'Could not save the word. Try again.' };
    }
  } finally {
    if (props.miningContext === miningContext && entry.value === word) mining.value = false;
  }
}

watch([() => props.miningContext, entry], () => {
  mining.value = false;
  recording.value = false;
  audioUnavailable.value = false;
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

    <p class="kr-dictionary-original" :lang="language">{{ originalForm }}</p>

    <p v-if="loading" class="kr-dictionary-message" role="status" aria-live="polite">Looking up definition…</p>
    <p v-else-if="error" class="kr-dictionary-message kr-dictionary-error" role="alert">{{ error }}</p>
    <template v-else-if="entry">
      <label v-if="japaneseMatches && japaneseMatches.length > 1" class="kr-match-picker">
        Dictionary match
        <select :value="entry.japanese?.id" lang="ja" :disabled="mining || markingKnown" @change="selectedLexeme = ($event.target as HTMLSelectElement).value">
          <option v-for="match in japaneseMatches" :key="match.entry.japanese?.id" :value="match.entry.japanese?.id">
            {{ match.entry.headword }} · {{ match.entry.japanese?.reading }} · {{ match.entry.definitions[0] }}
          </option>
        </select>
      </label>
      <div class="kr-dictionary-heading">
        <h2 :lang="language">{{ entry.headword }}</h2>
        <span v-if="entry.partOfSpeech">{{ entry.partOfSpeech }}</span>
        <span v-if="entry.frequencyRank" class="kr-frequency" :title="entry.japanese ? 'Jiten frequency rank' : entry.frequencyRank > 80000 ? 'Not found in the Shiberu frequency list' : 'Shiberu frequency rank'">#{{ (entry.japanese ? entry.frequencyRank : Math.min(entry.frequencyRank, 80000)).toLocaleString('en-US') }}{{ !entry.japanese && entry.frequencyRank > 80000 ? '+' : '' }}</span>
      </div>
      <p v-if="entry.pronunciation" :lang="language" class="kr-dictionary-pronunciation">
        {{ entry.pronunciation }}
      </p>
      <p v-if="entry.hanja?.length" class="kr-dictionary-pronunciation">
        Hanja {{ entry.hanja.join(', ') }}
      </p>
      <details v-if="entry.kanjiDetails?.length" class="kr-dictionary-section">
        <summary>Kanji</summary>
        <p v-for="kanji in entry.kanjiDetails" :key="kanji.character">
          <strong lang="ja">{{ kanji.character }}</strong>
          <span lang="ja"> {{ kanji.readings.join('、') }}</span>
          <span v-if="kanji.meanings.length"> · {{ kanji.meanings.join(', ') }}</span>
        </p>
      </details>
      <p v-if="entry.conjugations?.length" class="kr-dictionary-pronunciation">
        Forms {{ entry.conjugations.slice(0, 3).join(', ') }}
      </p>
      <section v-if="entry.definitions.length > 0" class="kr-dictionary-section">
        <h3>English</h3>
        <ol class="kr-dictionary-definitions">
          <li lang="en" v-for="(definition, index) in entry.definitions" :key="index">
            <button type="button" class="kr-definition-button" :aria-pressed="selectedDefinitions.includes(index)" @click="toggleDefinition(index)">{{ definition }}</button>
          </li>
        </ol>
      </section>
      <section v-else-if="entry.koreanDefinitions.length > 0" class="kr-dictionary-section">
        <h3>Korean definition</h3>
        <ol class="kr-dictionary-definitions" lang="ko">
          <li v-for="(definition, index) in entry.koreanDefinitions" :key="index">
            <button type="button" class="kr-definition-button" :aria-pressed="selectedDefinitions.includes(index)" @click="toggleDefinition(index)">{{ definition }}</button>
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
          <li v-for="(definition, index) in translatedDefinitions" :key="index"><button type="button" class="kr-definition-button" :aria-pressed="selectedDefinitions.includes(index)" @click="toggleDefinition(index)">{{ definition }}</button></li>
        </ol>
      </section>
      <section v-if="entry.examples.length > 0" class="kr-dictionary-section kr-dictionary-examples">
        <h3>Examples</h3>
        <p v-for="example in entry.examples.slice(0, 2)" :key="example" :lang="language">{{ example }}</p>
      </section>
      <div class="kr-mining-actions">
        <template v-if="miningContext">
          <p v-if="!savedContexts?.length && (entry.definitions.length || entry.koreanDefinitions.length) > 1" class="kr-dictionary-message">Select one or more definitions to mine.</p>
          <p v-if="!miningContext.image && miningContext.timestamp !== undefined" class="kr-dictionary-message" role="status">Video image unavailable; the word can still be saved.</p>
          <p v-if="audioUnavailable" role="status">Subtitle audio unavailable.</p>
          <p v-if="miningOutcome?.ok || contextAlreadySaved" role="status" :class="{ 'kr-word-celebration': miningOutcome?.ok && miningOutcome.outcome !== 'existing' }">
            <ReaderIcon v-if="miningOutcome?.ok && miningOutcome.outcome !== 'existing'" name="sparkle" class="kr-word-sparkle" />
            {{ miningOutcome?.ok && miningOutcome.outcome === 'mined' ? '✓ Mined'
              : miningOutcome?.ok && miningOutcome.outcome === 'added' ? '✓ Sentence saved'
              : miningOutcome?.ok && miningOutcome.outcome === 'audio-added' ? '✓ Audio saved'
              : 'Already mined · Sentence saved' }}
          </p>
          <p v-else-if="savedContexts?.length" class="kr-dictionary-message">Already mined</p>
        </template>
        <div class="kr-word-actions">
          <button
            v-if="miningContext && !miningOutcome?.ok && !contextAlreadySaved"
            type="button"
            class="kr-mine-button"
            :disabled="mining || translating || (!savedContexts?.length && !selectedDefinitions.length)"
            @click="saveWord"
          >
            {{ recording ? 'Recording audio…' : mining ? 'Saving…' : canAddAudio ? 'Add Audio' : savedContexts?.length ? 'Save Sentence' : 'Mine Word' }}
          </button>
          <button
            type="button"
            class="kr-mine-button kr-known-button"
            :aria-pressed="!!(isKnown || knownOutcome?.ok)"
            :aria-busy="markingKnown"
            :title="isKnown || knownOutcome?.ok ? `${entry.headword} is already known` : `Mark ${entry.headword} as known`"
            :disabled="markingKnown || isKnown || knownOutcome?.ok"
            @click="markKnown"
          >
            {{ markingKnown ? 'Saving…' : isKnown || knownOutcome?.ok ? '✓ Known' : 'Known' }}
          </button>
        </div>
        <p v-if="miningOutcome && !miningOutcome.ok" class="kr-dictionary-error" role="alert">
          {{ miningOutcome.error }}
        </p>
        <p v-if="knownOutcome?.ok" role="status" class="kr-word-celebration">
          <ReaderIcon name="sparkle" class="kr-word-sparkle" /> Marked as known.
        </p>
        <p v-else-if="knownOutcome" class="kr-dictionary-error" role="alert">{{ knownOutcome.error }}</p>
      </div>
    </template>
  </aside>
</template>
