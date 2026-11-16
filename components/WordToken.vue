<script setup lang="ts">
defineProps<{
  word: string;
  tokenId: string;
  selected?: boolean;
}>();

defineEmits<{
  select: [];
}>();
</script>

<template>
  <button
    type="button"
    class="kr-word-token"
    :class="{ 'kr-word-token-selected': selected }"
    :data-token-id="tokenId"
    @click="$emit('select')"
  >
    {{ word }}
  </button>
</template>
