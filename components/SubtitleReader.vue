<script setup lang="ts">
defineProps<{
  lines: string[];
  visible: boolean;
}>();
</script>

<template>
  <div
    v-if="visible && lines.length > 0"
    class="kr-subtitles"
    lang="ko"
    role="region"
    aria-label="Korean subtitles"
  >
    <p v-for="(line, index) in lines" :key="`${index}-${line}`" class="kr-subtitle-line">
      {{ line }}
    </p>
  </div>
</template>
