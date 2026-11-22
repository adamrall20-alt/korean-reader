<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import type { PracticeFeedback, PracticeQuestion } from '../shared/api';

const emit = defineEmits<{ 'open-library': [] }>();
const letters = ['A', 'B', 'C', 'D'];
const questions = shallowRef<PracticeQuestion[] | null>(null);
const position = ref(0);
const answers = shallowRef<PracticeFeedback[]>([]);
const choice = ref<number | null>(null);
const busy = ref(false);
const error = ref('');
const nextButton = ref<HTMLButtonElement>();
const question = computed(() => questions.value?.[position.value]);
const feedback = computed(() => answers.value[position.value]);
const missed = computed(() => answers.value.filter(({ correct }) => !correct));

function desktopApi() {
  const api = window.koreanReaderDesktop;
  if (!api) throw new Error('Desktop storage is unavailable.');
  return api;
}

async function start() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    questions.value = await desktopApi().startPractice();
    position.value = 0;
    answers.value = [];
    choice.value = null;
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'Could not start practice.';
  } finally {
    busy.value = false;
  }
}

async function answer(index: number) {
  if (!question.value || feedback.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const result = await desktopApi().answerPractice(question.value.id, index);
    choice.value = index;
    answers.value = [...answers.value, result];
    await nextTick();
    nextButton.value?.focus();
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'Could not save answer.';
  } finally {
    busy.value = false;
  }
}

function next() {
  if (busy.value || !feedback.value) return;
  choice.value = null;
  position.value += 1;
}

function handleKey(event: KeyboardEvent) {
  if (event.repeat || event.altKey || event.metaKey || event.ctrlKey || !question.value) return;
  if (event.target instanceof Element && event.target.closest('input, select, textarea, audio, [contenteditable]')) return;
  const letter = letters.indexOf(event.key.toUpperCase());
  const index = /^[1-4]$/.test(event.key) ? Number(event.key) - 1 : letter;
  if (index >= 0 && !feedback.value) {
    event.preventDefault();
    void answer(index);
  } else if (event.key === 'Enter' && feedback.value && !(event.target instanceof HTMLButtonElement)) {
    event.preventDefault();
    next();
  }
}

onMounted(() => window.addEventListener('keydown', handleKey));
onBeforeUnmount(() => window.removeEventListener('keydown', handleKey));
</script>

<template>
  <section class="mx-auto grid w-full max-w-3xl gap-5 rounded-2xl border border-interface/15 bg-ink-soft p-6" aria-labelledby="practice-heading">
    <header class="flex items-center justify-between gap-3">
      <h2 id="practice-heading" class="text-xl font-semibold">Quick practice</h2>
      <span v-if="question && questions" role="status" class="text-sm tabular-nums text-muted">{{ position + 1 }} / {{ questions.length }}</span>
    </header>
    <p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p>
    <template v-if="question">
      <div class="grid gap-3 rounded-xl border border-interface/15 bg-ink p-5" :key="question.id">
        <p class="text-sm font-medium text-muted">What does the highlighted word mean in this sentence?</p>
        <p lang="ko" class="whitespace-pre-wrap text-2xl font-medium leading-relaxed">{{ question.before }}<mark class="bg-transparent font-bold text-[#f59e0b]">{{ question.target }}</mark>{{ question.after }}</p>
      </div>
      <div class="grid gap-2 sm:grid-cols-2" role="group" aria-label="Answer options">
        <button v-for="(option, index) in question.options" :key="option" type="button" :disabled="busy || !!feedback"
          :aria-keyshortcuts="`${letters[index]} ${index + 1}`"
          class="flex items-center gap-3 rounded-xl border border-interface/20 bg-ink px-4 py-3 text-left font-medium enabled:hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
          :class="{ 'border-accent text-accent': feedback?.correctIndex === index, 'border-danger text-danger': feedback && choice === index && !feedback.correct }"
          @click="answer(index)">
          <span class="grid size-7 shrink-0 place-items-center rounded-md bg-interface/10 text-xs">{{ letters[index] }}</span>
          <span class="wrap-anywhere text-sm">{{ option }}</span>
        </button>
      </div>
      <div v-if="feedback" role="status" aria-live="polite" class="grid gap-2 border-t border-interface/10 pt-4">
        <p class="font-semibold" :class="feedback.correct ? 'text-accent' : 'text-danger'">
          {{ feedback.correct ? 'Correct!' : `Answer ${letters[feedback.correctIndex]} was correct.` }}
        </p>
        <p lang="ko" class="whitespace-pre-wrap">{{ feedback.sentence }}</p>
        <p class="text-sm text-muted"><strong lang="ko" class="text-paper">{{ feedback.headword }}</strong> · {{ feedback.meaning }}</p>
        <img v-if="feedback.imageDataUrl" :src="feedback.imageDataUrl" alt="Saved sentence context" class="max-h-48 max-w-full justify-self-start rounded-xl object-contain" />
        <audio v-if="feedback.audioDataUrl" :src="feedback.audioDataUrl" controls class="h-9 max-w-full" />
      </div>
      <button v-if="feedback" ref="nextButton" type="button" class="justify-self-end rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white" @click="next">
        {{ position + 1 === questions?.length ? 'See results' : 'Next question' }}
      </button>
      <button v-else-if="error" type="button" class="justify-self-start text-sm text-accent" @click="start">Start a new session</button>
    </template>
    <template v-else>
      <template v-if="questions?.length">
        <p class="text-lg font-semibold tabular-nums">{{ answers.length - missed.length }} / {{ answers.length }} correct</p>
        <div v-if="missed.length" class="grid gap-2">
          <h3 class="text-sm font-medium text-muted">Words to revisit</h3>
          <ul class="grid gap-2">
            <li v-for="(entry, i) in missed" :key="i" class="rounded-lg border border-interface/10 bg-ink px-3 py-2 text-sm">
              <strong lang="ko">{{ entry.headword }}</strong> · {{ entry.meaning }}
              <p lang="ko" class="whitespace-pre-wrap text-muted">{{ entry.sentence }}</p>
            </li>
          </ul>
        </div>
      </template>
      <p v-else-if="questions" class="max-w-prose text-sm text-muted">Add more cards with a clear definition and a saved sentence. Practice needs four distinct options for each question.</p>
      <p v-else class="max-w-prose text-sm text-muted">Try up to 10 questions from your saved sentences whenever you feel like practising.</p>
      <div class="flex flex-wrap gap-3">
        <button type="button" :disabled="busy" class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="start">
          {{ busy ? 'Building questions…' : questions?.length ? 'Practise again' : questions ? 'Try again' : 'Start practice' }}
        </button>
        <button v-if="questions?.length === 0" type="button" class="rounded-lg border border-interface/15 px-4 py-2 text-sm" @click="emit('open-library')">Open Library</button>
      </div>
    </template>
  </section>
</template>
