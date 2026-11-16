<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { browser } from 'wxt/browser';
import DictionaryPopup from '@/components/DictionaryPopup.vue';
import WordToken from '@/components/WordToken.vue';
import { findVideo, readVideoTimestamp } from '@/services/youtube/captions';
import type {
  DictionaryEntry,
  LookupResponse,
  SubtitleToken,
  TokenizedSubtitleLine,
} from '@/types/messages';

import type { VocabularyContext } from '@/types/vocabulary';

const miningContext = ref<VocabularyContext>();
const savedContexts = ref<VocabularyContext[]>([]);
const selectedTokenId = ref<string | null>(null);
const selectedToken = ref<SubtitleToken | null>(null);
const dictionaryEntry = ref<DictionaryEntry | null>(null);
const lookupError = ref<string | null>(null);
const lookupLoading = ref(false);
const popupStyle = ref<Record<string, string>>({});
const readerElement = ref<HTMLElement | null>(null);

const positionPopup = (tokenElement: HTMLElement) => {
  const bounds = tokenElement.getBoundingClientRect();
  const popup = readerElement.value?.querySelector<HTMLElement>('.kr-dictionary-popup');
  const width = popup?.offsetWidth ?? 704;
  const height = popup?.offsetHeight ?? 320;
  const margin = 8;
  const halfWidth = width / 2;
  const center = bounds.left + bounds.width / 2;
  const left = Math.min(
    Math.max(center, halfWidth + margin),
    window.innerWidth - halfWidth - margin,
  );
  const canFitAbove = height + margin <= bounds.top;
  const top = canFitAbove
    ? bounds.top - margin
    : Math.max(margin, Math.min(bounds.bottom + margin, window.innerHeight - height - margin));

  popupStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    transform: canFitAbove ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
  };
};

let lookupGeneration = 0;

const repositionPopup = () => {
  const tokenElement = Array.from(
    readerElement.value?.querySelectorAll<HTMLElement>('[data-token-id]') ?? [],
  ).find((element) => element.dataset.tokenId === selectedTokenId.value);

  if (tokenElement) positionPopup(tokenElement);
};

const selectToken = async (token: SubtitleToken) => {
  const generation = ++lookupGeneration;
  const video = findVideo(document);
  video?.pause();
  miningContext.value = props.source ? {
    ...props.source,
    originalForm: token.text,
    timestamp: readVideoTimestamp(video) ?? props.source.timestamp,
  } : undefined;
  savedContexts.value = [];
  selectedTokenId.value = token.id;
  selectedToken.value = token;
  dictionaryEntry.value = null;
  lookupError.value = null;
  lookupLoading.value = true;

  try {
    const response = (await browser.runtime.sendMessage({
      type: 'lookup',
      word: token.text,
      morphemes: token.morphemes,
    })) as LookupResponse | undefined;

    if (generation !== lookupGeneration) return;

    if (response?.ok && response.entry) {
      dictionaryEntry.value = response.entry;
      savedContexts.value = response.savedContexts ?? [];
    } else {
      lookupError.value = response?.error ?? 'Dictionary lookup failed.';
    }
  } catch (error: unknown) {
    if (generation === lookupGeneration) {
      lookupError.value =
        error instanceof Error ? error.message : 'Dictionary lookup failed.';
    }
  } finally {
    if (generation === lookupGeneration) lookupLoading.value = false;
  }
};

const props = defineProps<{
  lines: TokenizedSubtitleLine[];
  visible: boolean;
  source?: Omit<VocabularyContext, 'originalForm'>;
}>();

const closePopup = () => {
  lookupGeneration += 1;
  selectedTokenId.value = null;
  selectedToken.value = null;
  dictionaryEntry.value = null;
  lookupError.value = null;
  lookupLoading.value = false;
};

watch([() => props.lines, () => props.visible], closePopup);
watch([selectedToken, lookupLoading, dictionaryEntry, lookupError], repositionPopup, {
  flush: 'post',
});

const handleDocumentClick = (event: MouseEvent) => {
  if (readerElement.value && !event.composedPath().includes(readerElement.value)) {
    closePopup();
  }
};

onMounted(() => {
  document.addEventListener('click', handleDocumentClick, true);
  window.addEventListener('resize', repositionPopup);
  window.addEventListener('scroll', repositionPopup, true);
});
onBeforeUnmount(() => {
  lookupGeneration += 1;
  document.removeEventListener('click', handleDocumentClick, true);
  window.removeEventListener('resize', repositionPopup);
  window.removeEventListener('scroll', repositionPopup, true);
});
</script>

<template>
  <div
    v-if="visible && lines.length > 0"
    ref="readerElement"
    class="kr-subtitles"
    lang="ko"
    role="region"
    aria-label="Korean subtitles"
  >
    <p v-for="(line, index) in lines" :key="`${index}-${line.text}`" class="kr-subtitle-line">
      <template v-for="token in line.tokens" :key="token.id">
        <WordToken
          v-if="token.clickable"
          :word="token.text"
          :token-id="token.id"
          :selected="selectedTokenId === token.id"
          @select="selectToken(token)"
        />
        <span v-else>{{ token.text }}</span>
      </template>
    </p>
    <DictionaryPopup
      v-if="selectedToken"
      :entry="dictionaryEntry"
      :original-form="selectedToken.text"
      :loading="lookupLoading"
      :error="lookupError"
      :style="popupStyle"
      :mining-context="miningContext"
      :saved-contexts="savedContexts"
      @close="closePopup"
      @resize="repositionPopup"
    />
  </div>
</template>
