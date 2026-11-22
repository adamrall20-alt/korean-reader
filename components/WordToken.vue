<script setup lang="ts">
defineProps<{
  word: string;
  tokenId: string;
  selected?: boolean;
  unknown?: boolean;
}>();

defineEmits<{
  select: [];
}>();
</script>

<template>
  <button
    type="button"
    class="kr-word-token"
    :class="{ 'kr-word-token-selected': selected, 'kr-word-token-unknown': unknown }"
    :data-token-id="tokenId"
    :aria-pressed="selected ? 'true' : undefined"
    @click="$emit('select')"
  >{{ word }}</button>
</template>
