<template>
  <div class="reader-content" :style="contentStyle" v-html="content"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useReaderStore } from '@/stores/reader-store'

const props = defineProps<{ content: string }>()
const store = useReaderStore()

const contentStyle = computed(() => ({
  fontSize: store.settings.fontSize + 'px',
  fontFamily: store.settings.fontFamily,
  lineHeight: store.settings.lineHeight,
  color: store.settings.textColor,
  backgroundColor: store.settings.bgColor,
}))
</script>

<style scoped>
.reader-content { padding: 24px 20px; min-height: 60vh; word-wrap: break-word; }
.reader-content :deep(p) { margin: 0 0 1em; text-indent: 2em; }
</style>
