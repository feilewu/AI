<template>
  <div class="source-selector">
    <label v-for="s in sources" :key="s.bookSourceUrl" class="source-option">
      <input type="checkbox" :value="s.bookSourceUrl" v-model="selected" />
      <span>{{ s.bookSourceName }}</span>
    </label>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSourceStore } from '@/stores/source-store'

const sourceStore = useSourceStore()
const sources = computed(() => sourceStore.sources.filter(s => s.enabled))
const selected = ref<string[]>([])

watch(sources, (s) => {
  if (s.length > 0 && selected.value.length === 0) {
    selected.value = s.map(s => s.bookSourceUrl)
  }
}, { immediate: true })

defineExpose({ selected, sources })
</script>

<style scoped>
.source-selector { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 12px 12px; }
.source-option { display: flex; align-items: center; gap: 4px; font-size: 13px; cursor: pointer; }
</style>
