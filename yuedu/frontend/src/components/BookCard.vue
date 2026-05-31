<template>
  <div class="book-card" @click="router.push(`/book/${book.id}`)">
    <img v-if="book.coverUrl" :src="book.coverUrl" class="card-cover" alt="" />
    <div v-else class="card-cover-placeholder">{{ book.name?.charAt(0) }}</div>
    <div class="card-info">
      <div class="card-name">{{ book.name }}</div>
      <div class="card-author">{{ book.author }}</div>
      <div class="card-progress" v-if="lastChapter">
        读到: {{ truncate(lastChapter, 20) }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { Book } from '@/types'

const props = defineProps<{ book: Book; lastChapter?: string }>()
const router = useRouter()

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text
}
</script>

<style scoped>
.book-card { display: flex; gap: 12px; padding: 12px; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
.book-card:hover { background: #f5f5f5; }
.card-cover { width: 64px; height: 88px; object-fit: cover; border-radius: 4px; }
.card-cover-placeholder { width: 64px; height: 88px; background: #1a1a2e; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 24px; border-radius: 4px; }
.card-info { flex: 1; }
.card-name { font-size: 16px; font-weight: bold; }
.card-author { font-size: 13px; color: #666; margin-top: 4px; }
.card-progress { font-size: 12px; color: #999; margin-top: 4px; }
</style>
