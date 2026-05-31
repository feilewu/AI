<template>
  <div class="reader-nav">
    <button @click="$emit('prev')" :disabled="!hasPrev" class="nav-btn">上一章</button>
    <select @change="e => $emit('jump', Number((e.target as HTMLSelectElement).value))" :value="currentIndex" class="chapter-select">
      <option v-for="ch in chapters" :key="ch.index" :value="ch.index">
        {{ ch.title }}
      </option>
    </select>
    <button @click="$emit('next')" :disabled="!hasNext" class="nav-btn">下一章</button>
  </div>
</template>

<script setup lang="ts">
import type { Chapter } from '@/types'
defineProps<{ chapters: Chapter[]; currentIndex: number; hasPrev: boolean; hasNext: boolean }>()
defineEmits<{ prev: []; next: []; jump: [index: number] }>()
</script>

<style scoped>
.reader-nav { display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: #fff; border-top: 1px solid #eee; }
.nav-btn { padding: 6px 16px; background: #1a1a2e; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
.nav-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.chapter-select { flex: 1; padding: 6px; font-size: 14px; }
</style>
