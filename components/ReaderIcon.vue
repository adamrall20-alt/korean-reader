<script setup lang="ts">
defineProps<{
  name: 'settings' | 'statistics' | 'general' | 'dictionary' | 'anki' | 'import-known'
    | 'appearance' | 'storage' | 'transcript' | 'page' | 'sparkle';
}>();
</script>

<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path v-if="name === 'settings' || name === 'general'" d="M5 6h5m4 0h5M5 12h9m4 0h1M5 18h2m4 0h8M10 4v4m8 2v4M7 16v4" />
    <path v-else-if="name === 'statistics'" d="M4 19h16M7 15v-3m5 3V9m5 6V6M5 8l4-3" />
    <path v-else-if="name === 'dictionary'" d="M12 6c-2.4-1.8-5-2.2-9-1v13c4-1.2 6.6-.8 9 1 2.4-1.8 5-2.2 9-1V5c-4-1.2-6.6-.8-9 1Zm0 0v13m3-9 3-.5M6 9.5l3 .5" />
    <path v-else-if="name === 'anki'" d="m8 7-4 1 2 11 9-1m-6-6 1-7 10 1-1 11-10-1v-4Zm4 0 1.4 1.4L17 10" />
    <path v-else-if="name === 'import-known'" d="M4 8h15m-4-4 4 4-4 4m5 4H5m4-4-4 4 4 4" />
    <path v-else-if="name === 'appearance' || name === 'sparkle'" d="M10 4c0 5-2 7-7 8 5 1 7 3 7 8 1-5 3-7 8-8-5-1-7-3-8-8Zm8 1v4m-2-2h4" />
    <path v-else-if="name === 'storage'" d="M5 9h14v10H5V9Zm-1-4h16v4H4V5Zm6 8h4" />
    <path v-else-if="name === 'transcript'" d="M4 6h16v10h-8l-4 3v-3H4V6Zm4 4h8m-8 3h5" />
    <path v-else d="M6 4h8l4 4v12H6V4Zm8 0v4h4M9 12h6m-6 4h6" />
  </svg>
</template>
