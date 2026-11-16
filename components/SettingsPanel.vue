<script setup lang="ts">
const sections = [
  {
    id: 'general',
    title: 'General',
    description: 'Extension behaviour, startup preferences and interface language.',
    phase: 'Phase 7',
  },
  {
    id: 'dictionary',
    title: 'Dictionary',
    description: 'KRDict API key, lookup preferences and local dictionary cache controls.',
    phase: 'Phase 3',
  },
  {
    id: 'anki',
    title: 'Anki',
    description: 'AnkiConnect connection, default deck and Kimchi Sentence Mining field mapping.',
    phase: 'Phase 5',
  },
  {
    id: 'appearance',
    title: 'Appearance',
    description: 'Subtitle font size, overlay position and light or dark appearance.',
    phase: 'Phase 7',
  },
  {
    id: 'storage',
    title: 'Storage',
    description: 'Local vocabulary storage, JSON export and cache management.',
    phase: 'Phase 4',
  },
] as const;
</script>

<template>
  <div class="min-h-screen bg-ink text-paper">
    <header class="border-b border-white/10">
      <div class="mx-auto flex max-w-5xl items-center gap-3 px-6 py-4">
        <div
          class="grid size-9 place-items-center rounded-xl bg-accent text-sm font-bold tracking-tight text-white"
          aria-hidden="true"
        >
          KR
        </div>
        <div>
          <p class="text-sm font-semibold tracking-tight">Korean Reader</p>
          <p class="text-xs text-muted">Settings</p>
        </div>
        <span
          class="ml-auto rounded-full border border-white/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted"
        >
          Phase 0
        </span>
      </div>
    </header>

    <main class="mx-auto grid max-w-5xl gap-6 px-6 py-8 md:grid-cols-[190px_1fr]">
      <nav aria-label="Settings sections">
        <p class="mb-3 px-3 text-[11px] font-medium uppercase tracking-wider text-muted">
          Categories
        </p>
        <ul class="space-y-1">
          <li v-for="section in sections" :key="section.id">
            <a
              :href="`#${section.id}`"
              class="block rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-paper"
            >
              {{ section.title }}
            </a>
          </li>
        </ul>
      </nav>

      <div>
        <div class="mb-6">
          <h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-muted">
            The settings shell is in place. Each category will be connected to local storage as
            its feature is implemented.
          </p>
        </div>

        <div class="space-y-4">
          <section
            v-for="section in sections"
            :id="section.id"
            :key="section.id"
            class="scroll-mt-6 rounded-2xl border border-white/10 bg-ink-soft p-5"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 class="text-base font-medium">{{ section.title }}</h2>
                <p class="mt-2 max-w-xl text-sm leading-6 text-muted">
                  {{ section.description }}
                </p>
              </div>
              <span
                class="shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-medium text-muted"
              >
                {{ section.phase }}
              </span>
            </div>
            <p class="mt-4 border-t border-white/10 pt-4 text-xs text-muted">
              This section is a placeholder and does not save any settings yet.
            </p>
          </section>
        </div>
      </div>
    </main>
  </div>
</template>
