<template>
  <div class="book-item" @click="$emit('select', book)">
    <img v-if="book.coverUrl" :src="book.coverUrl" class="book-cover" alt="" />
    <div class="book-info">
      <div class="book-name">{{ book.name }}</div>
      <div class="book-author">{{ book.author }}</div>
      <div class="book-intro">{{ truncate(book.intro, 80) }}</div>
      <div class="book-source">来源: {{ book.sourceName }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Book } from '@/types'

defineProps<{ book: Partial<Book> & { sourceName?: string } }>()
defineEmits<{ select: [book: any] }>()

function truncate(text: string | undefined, max: number): string {
  return text && text.length > max ? text.slice(0, max) + '...' : text || ''
}
</script>

<style scoped>
.book-item { display: flex; gap: 12px; padding: 12px; border-bottom: 1px solid #eee; cursor: pointer; }
.book-item:hover { background: #f5f5f5; }
.book-cover { width: 72px; height: 100px; object-fit: cover; border-radius: 4px; }
.book-name { font-size: 16px; font-weight: bold; }
.book-author { font-size: 13px; color: #666; }
.book-intro { font-size: 13px; color: #999; margin-top: 4px; }
.book-source { font-size: 12px; color: #aaa; margin-top: 4px; }
</style>
