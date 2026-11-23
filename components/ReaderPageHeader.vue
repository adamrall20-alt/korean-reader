<script setup lang="ts">
import PenguinMark from './PenguinMark.vue';
import ReaderIcon from './ReaderIcon.vue';

defineProps<{ page: 'settings' | 'statistics' }>();

const pages = [
  { id: 'settings', title: 'Settings', href: '/options.html' },
  { id: 'statistics', title: 'Statistics', href: '/statistics.html' },
] as const;
</script>

<template>
  <header class="relative z-10 border-b border-interface/10 bg-ink">
    <div class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-3">
      <div class="flex items-center gap-3">
        <PenguinMark />
        <p class="text-sm font-semibold tracking-tight">Korean Reader</p>
      </div>
      <nav aria-label="Extension pages" class="flex flex-wrap gap-1 rounded-xl border border-interface/10 bg-ink-soft p-1">
        <a v-for="item in pages" :key="item.id" :href="item.href"
          :aria-current="page === item.id ? 'page' : undefined"
          class="reader-icon-link flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-interface/5 hover:text-paper aria-[current=page]:bg-accent/10 aria-[current=page]:text-paper"
        >
          <ReaderIcon :name="item.id" class="size-4 shrink-0 text-accent" />
          {{ item.title }}
        </a>
      </nav>
    </div>
  </header>
</template>
