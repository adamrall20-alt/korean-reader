<script setup lang="ts">
import type { CSSProperties } from 'vue';
import type { DictionaryEntry } from '@/types/messages';

defineProps<{
  entry: DictionaryEntry | null;
  originalForm: string;
  loading: boolean;
  error: string | null;
  style: CSSProperties;
}>();

defineEmits<{
  close: [];
}>();
</script>

<template>
  <aside
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
      <section v-if="entry.definitions.length > 0" class="kr-dictionary-section">
        <h3>English</h3>
        <ol class="kr-dictionary-definitions">
          <li v-for="definition in entry.definitions.slice(0, 3)" :key="definition">
            {{ definition }}
          </li>
        </ol>
      </section>
      <section v-if="entry.koreanDefinitions.length > 0" class="kr-dictionary-section">
        <h3>Korean</h3>
        <ol class="kr-dictionary-definitions">
          <li v-for="definition in entry.koreanDefinitions.slice(0, 3)" :key="definition">
            {{ definition }}
          </li>
        </ol>
      </section>
      <div v-if="entry.examples.length > 0" class="kr-dictionary-examples">
        <p v-for="example in entry.examples.slice(0, 2)" :key="example">{{ example }}</p>
      </div>
    </template>
  </aside>
</template>
