<template>
  <div class="chapter-list">
    <div
      v-for="ch in chapters"
      :key="ch.id || ch.index"
      class="chapter-item"
      @click="$emit('select', ch)"
    >
      <span class="ch-index">{{ ch.index + 1 }}</span>
      <span class="ch-title">{{ ch.title }}</span>
      <span v-if="ch.isVip" class="ch-vip">VIP</span>
    </div>
    <div v-if="chapters.length === 0" class="no-chapters">暂无章节</div>
  </div>
</template>

<script setup lang="ts">
import type { Chapter } from '@/types'
defineProps<{ chapters: Chapter[] }>()
defineEmits<{ select: [chapter: Chapter] }>()
</script>

<style scoped>
.chapter-list { padding: 8px 16px; }
.chapter-item { display: flex; align-items: center; gap: 8px; padding: 10px 8px; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
.chapter-item:hover { background: #f5f5f5; }
.ch-index { color: #999; font-size: 12px; min-width: 24px; }
.ch-title { flex: 1; font-size: 14px; }
.ch-vip { color: #e67e22; font-size: 11px; padding: 2px 6px; background: #fdf2e9; border-radius: 2px; }
.no-chapters { padding: 24px; text-align: center; color: #999; }
</style>
