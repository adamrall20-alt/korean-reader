<script setup lang="ts">
import ReaderIcon from './ReaderIcon.vue';
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import SubtitleReader from '@/components/SubtitleReader.vue';
import TranscriptRow from '@/components/TranscriptRow.vue';
import { subtitleStyle, type InterfaceTheme, type SubtitleAppearance } from '@/types/preferences';
import { transcriptVocabulary, vocabularyCoverage } from '@/services/korean/coverage';
import { tokenizeLines, TOKENIZE_BATCH_LIMIT } from '@/services/korean/tokenize-client';
import type { TokenizedSubtitleLine } from '@/types/messages';
import type { TranscriptCue } from '@/services/youtube/transcript';
import type { createSubtitleOverlay } from '@/services/youtube/overlay';
import { captureVideoFrame } from '@/services/youtube/capture';
import { findPlayer, findVideo, getYouTubeVideoId, hasKorean } from '@/services/youtube/captions';
import { seekTranscriptVideo } from '@/services/youtube/transcript';

const props = defineProps<{
  cues: readonly TranscriptCue[];
  active?: TranscriptCue;
  status: 'loading' | 'full' | 'collecting';
  videoId: string;
  theme: InterfaceTheme;
  appearance: SubtitleAppearance;
  knownHeadwords: ReadonlySet<string>;
  width: number;
  follow: boolean;
  prepareAudio: ReturnType<typeof createSubtitleOverlay>['prepareCueAudio'];
}>();
const emit = defineEmits<{ close: []; resize: [number]; follow: [boolean] }>();

const analysedLines = new Map<string, TokenizedSubtitleLine>();
const coverageWords = shallowRef(new Map<string, Set<string>>());
const coverageState = ref<'loading' | 'ready' | 'error'>('loading');
const coverage = computed(() => vocabularyCoverage(coverageWords.value, props.knownHeadwords));
const coverageTitle = computed(() => `${coverage.value.known} of ${coverage.value.total} unique words known${props.status === 'collecting' ? ' — collected subtitles only' : ''}`);
watch([() => props.cues, () => props.status, () => props.videoId], async (_, __, onCleanup) => {
  let cancelled = false;
  onCleanup(() => { cancelled = true; });
  coverageState.value = 'loading';
  if (props.status === 'loading') return;
  const texts = [...new Set(props.cues.map((cue) => cue.text).filter(hasKorean))];
  const pending = texts.filter((text) => !analysedLines.has(text));
  try {
    for (let start = 0; start < pending.length; start += TOKENIZE_BATCH_LIMIT) {
      const batch = pending.slice(start, start + TOKENIZE_BATCH_LIMIT);
      const lines = await tokenizeLines(batch);
      if (cancelled) return;
      lines.forEach((line, index) => analysedLines.set(batch[index]!, line));
    }
    if (cancelled) return;
    coverageWords.value = transcriptVocabulary(texts.map((text) => analysedLines.get(text)!));
    coverageState.value = 'ready';
  } catch {
    if (!cancelled) coverageState.value = 'error';
  }
}, { immediate: true });

const query = ref('');
const search = computed(() => query.value.trim().replace(/\s+/gu, ' ').normalize('NFC').toLocaleLowerCase());
const visibleCues = computed(() => search.value ? props.cues.filter(({ text }) =>
  text.replace(/\s+/gu, ' ').normalize('NFC').toLocaleLowerCase().includes(search.value),
) : props.cues);
const list = ref<HTMLOListElement>();
const error = ref('');
const emptyLines: TokenizedSubtitleLine[] = [];
const popupOpen = ref(false);
const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver((entries, observer) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    observer.unobserve(entry.target);
    entry.target.dispatchEvent(new Event('kr-analyse'));
  }
}, { rootMargin: '100px' });
onBeforeUnmount(() => observer?.disconnect());

watch([() => props.active, () => props.follow, search, list], () => {
  if (!props.follow || search.value || popupOpen.value) return;
  const scroller = list.value;
  const row = scroller?.querySelector<HTMLElement>('[aria-current="true"]');
  if (!scroller || !row) return;
  const bounds = scroller.getBoundingClientRect();
  const current = row.getBoundingClientRect();
  if (current.top < bounds.top || current.bottom > bounds.bottom) {
    scroller.scrollTop += current.top - bounds.top - (bounds.height - current.height) / 2;
  }
}, { flush: 'post' });

function playbackVideo(videoId = props.videoId) {
  if (getYouTubeVideoId(location.href) !== videoId || findPlayer(document)?.classList.contains('ad-showing')) return;
  return findVideo(document) ?? undefined;
}

function seek(cue: TranscriptCue) {
  const video = playbackVideo();
  error.value = '';
  try {
    if (!video) throw new Error();
    video.currentTime = cue.start;
  } catch {
    error.value = 'Could not seek to this subtitle. Try again when the video is ready.';
  }
}

function wordSelection(cue: TranscriptCue) {
  const videoId = props.videoId;
  const video = playbackVideo(videoId);
  video?.pause();
  const recordAudio = video && props.prepareAudio(video, videoId, {
    start: cue.start, end: cue.end, observedAt: cue.observedAt ?? cue.start, caption: cue.text,
  }, cue.start);
  return {
    source: {
      sentence: cue.text,
      sourceUrl: 'https://www.youtube.com/watch?v=' + encodeURIComponent(videoId),
      sourceTitle: document.title.replace(/ - YouTube$/, ''),
      timestamp: cue.start,
    },
    async prepareMine(signal: AbortSignal) {
      if (!video || playbackVideo(videoId) !== video) throw new Error('Video unavailable');
      video.pause();
      await seekTranscriptVideo(video, cue.start, signal);
      signal.throwIfAborted();
      if (playbackVideo(videoId) !== video) throw new Error('Video changed');
      return { image: captureVideoFrame(video) };
    },
    recordAudio,
  };
}

function startResize(event: PointerEvent) {
  if (event.button !== 0) return;
  const handle = event.currentTarget as HTMLElement;
  handle.setPointerCapture(event.pointerId);
  const start = event.clientX;
  const width = handle.parentElement?.getBoundingClientRect().width ?? props.width;
  const move = (next: PointerEvent) => emit('resize', width + start - next.clientX);
  handle.addEventListener('pointermove', move);
  handle.addEventListener('lostpointercapture', () => handle.removeEventListener('pointermove', move), { once: true });
}
</script>

<template>
  <SubtitleReader
    v-slot="{ selectToken, closePopup }"
    class="kr-transcript"
    :data-theme="theme"
    :style="subtitleStyle(appearance)"
    :lines="emptyLines"
    :visible="true"
    :known-headwords="knownHeadwords"
    @popup-change="popupOpen = $event"
  >
    <div
      class="kr-transcript-resize"
      role="separator"
      aria-label="Transcript width"
      aria-orientation="vertical"
      :aria-valuemin="240"
      :aria-valuemax="620"
      :aria-valuenow="width"
      tabindex="0"
      @pointerdown="startResize"
      @keydown.left.prevent="emit('resize', width + 24)"
      @keydown.right.prevent="emit('resize', width - 24)"
    ></div>
    <header>
      <div class="kr-transcript-heading">
        <h2><ReaderIcon name="transcript" class="kr-transcript-icon" /> Korean transcript</h2>
        <span v-if="coverageState === 'ready' && coverage.percentage !== null" class="kr-transcript-coverage" :title="coverageTitle" :aria-label="coverageTitle">
          {{ coverage.percentage }}% known<span v-if="status === 'collecting'"> (partial)</span>
        </span>
        <span v-else class="kr-transcript-coverage" role="status">{{ coverageState === 'error' ? 'Coverage unavailable' : coverageState === 'ready' ? 'No words' : 'Calculating…' }}</span>
      </div>
      <button type="button" aria-label="Close transcript" @click="emit('close')">×</button>
    </header>
    <div class="kr-transcript-controls">
      <input v-model="query" type="search" aria-label="Search transcript" placeholder="Search transcript" @input="closePopup" />
      <label><input type="checkbox" :checked="follow" @change="emit('follow', ($event.target as HTMLInputElement).checked)" /> Auto-scroll</label>
    </div>
    <p v-if="status === 'loading'" class="kr-transcript-status" role="status">Loading Korean transcript…</p>
    <p v-else-if="status === 'collecting'" class="kr-transcript-status" role="status">
      Full Korean transcript unavailable. Turn on Korean captions to collect lines as the video plays.
    </p>
    <p v-if="error" class="kr-transcript-status" role="alert">{{ error }}</p>
    <p v-if="search && !visibleCues.length" class="kr-transcript-status" role="status">No matching subtitles.</p>
    <ol ref="list" class="kr-transcript-list" @scroll="closePopup">
      <TranscriptRow
        v-for="cue in visibleCues"
        :key="cue.start + ':' + cue.text"
        :cue="cue"
        :active="cue === active"
        :known-headwords="knownHeadwords"
        :observer="observer"
        @seek="closePopup(); seek(cue)"
        @select="(token, anchor) => selectToken(token, anchor, wordSelection(cue))"
      />
    </ol>
  </SubtitleReader>
</template>
