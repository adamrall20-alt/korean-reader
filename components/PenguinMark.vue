<script setup lang="ts">
import logo from '@/assets/New logo update.png';
</script>

<template>
  <span class="penguin-mark" aria-hidden="true">
    <img :src="logo" alt="" class="penguin-mark-image" />
    <span class="penguin-mark-spark penguin-mark-spark-first"></span>
    <span class="penguin-mark-spark penguin-mark-spark-second"></span>
  </span>
</template>

<style scoped>
.penguin-mark {
  position: relative;
  display: inline-grid;
  flex: none;
  width: 2.75rem;
  height: 2.75rem;
  place-items: center;
  border-radius: 0.9rem;
  background: color-mix(in srgb, var(--color-accent) 12%, var(--color-ink-soft));
}

.penguin-mark-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform-origin: 50% 83%;
}

.penguin-mark-spark {
  position: absolute;
  width: 0.24rem;
  height: 0.24rem;
  border-radius: 1px;
  background: var(--color-accent);
  opacity: 0;
  pointer-events: none;
}

.penguin-mark-spark-first {
  top: 0.3rem;
  right: 0.25rem;
  --spark-x: 0.3rem;
  --spark-y: -0.45rem;
}

.penguin-mark-spark-second {
  top: 1rem;
  right: 0.1rem;
  --spark-x: 0.5rem;
  --spark-y: -0.2rem;
}

@media (prefers-reduced-motion: no-preference) {
  .penguin-mark-image {
    animation: penguin-hello 650ms ease-out both;
  }

  .penguin-mark-spark {
    animation: penguin-spark 550ms 100ms ease-out both;
  }

  @media (hover: hover) {
    .penguin-mark:hover .penguin-mark-image {
      animation-name: penguin-waddle;
    }
  }
}

@keyframes penguin-hello {
  0%, 100% { transform: none; }
  25% { transform: translateY(-17%) rotate(-10deg); }
  55% { transform: scale(1.08, 0.94) rotate(6deg); }
  78% { transform: translateY(-4%) rotate(-3deg); }
}

@keyframes penguin-waddle {
  0%, 100% { transform: none; }
  26%, 70% { transform: rotate(-12deg); }
  48%, 86% { transform: rotate(9deg); }
}

@keyframes penguin-spark {
  0%, 100% { opacity: 0; }
  26% { opacity: 1; }
  100% { transform: translate(var(--spark-x), var(--spark-y)) rotate(65deg) scale(0.5); }
}
</style>
