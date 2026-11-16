<script setup lang="ts">
defineProps<{
  word: string;
}>();
</script>

<template>
  <span class="rounded px-0.5 transition-colors hover:bg-accent/15 hover:text-accent">
    {{ word }}
  </span>
</template>
