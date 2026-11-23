<script setup lang="ts">
import { hasJapaneseText, type ReaderLanguage } from '@/types/language';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import WordToken from '@/components/WordToken.vue';
import { isKnownSubtitleWord, resolveRenderTokens } from '@/services/korean/dictionary-forms';
import { getCachedTokenizedLine, tokenizeLines } from '@/services/korean/tokenize-client';
import { hasKorean } from '@/services/youtube/captions';
import { formatTranscriptTime, type TranscriptCue } from '@/services/youtube/transcript';
import type { SubtitleToken } from '@/types/messages';

const props = defineProps<{
  cue: TranscriptCue;
  language?: ReaderLanguage;
  active: boolean;
  knownHeadwords: ReadonlySet<string>;
  observer?: IntersectionObserver;
}>();
const emit = defineEmits<{ seek: []; select: [SubtitleToken, HTMLElement] }>();
const row = ref<HTMLElement>();
const cueHasLanguage = (props.language === 'ja' ? hasJapaneseText : hasKorean)(props.cue.text);
const cachedLine = cueHasLanguage ? getCachedTokenizedLine(props.cue.text, props.language) : undefined;
const hasClickableCached = Boolean(cachedLine && (props.language === 'ja' || cachedLine.tokens.some((token) => token.clickable)));
let offset = 0;
const tokens = shallowRef<SubtitleToken[]>(
  hasClickableCached
    ? cachedLine!.tokens
    : props.cue.text.split(/(\s+)/u).map((text) => {
      const start = offset;
      offset += text.length;
      return { text, id: '0:' + start, start, length: text.length, clickable: props.language !== 'ja' && hasKorean(text), morphemes: [] };
    }),
);
let analysis: Promise<void> | undefined = hasClickableCached ? Promise.resolve() : undefined;
const renderedTokens = computed(() => resolveRenderTokens(tokens.value, props.knownHeadwords));

function analyse() {
  if (!cueHasLanguage) return Promise.resolve();
  return analysis ??= (async () => {
    try {
      const [line] = await tokenizeLines([props.cue.text], props.language);
      if (line && (props.language === 'ja' || line.tokens.some((token) => token.clickable))) {
        tokens.value = line.tokens;
      }
    } catch {
      // The surface words remain clickable if analysis is temporarily unavailable.
    }
  })();
}

onMounted(() => {
  if (!analysis && cueHasLanguage && row.value && props.observer) {
    row.value.addEventListener('kr-analyse', analyse);
    props.observer.observe(row.value);
  } else if (!props.observer) void analyse();
});
onBeforeUnmount(() => {
  if (!row.value) return;
  props.observer?.unobserve(row.value);
  row.value.removeEventListener('kr-analyse', analyse);
});
</script>

<template>
  <li ref="row" class="kr-transcript-row" :aria-current="active ? 'true' : undefined">
    <button type="button" class="kr-transcript-seek" :aria-label="'Seek to ' + formatTranscriptTime(cue.start)" @click="emit('seek')">
      <span aria-hidden="true">▶</span> {{ formatTranscriptTime(cue.start) }}
    </button>
    <span :lang="language ?? 'ko'" class="kr-transcript-text">
      <template v-for="token in renderedTokens" :key="token.id">
        <WordToken
          v-if="token.clickable"
          :word="token.text"
          :token-id="token.id"
          :unknown="!isKnownSubtitleWord(token, knownHeadwords)"
          @click="emit('select', token, $event.currentTarget as HTMLElement)"
        />
        <template v-else>{{ token.text }}</template>
      </template>
    </span>
  </li>
</template>
