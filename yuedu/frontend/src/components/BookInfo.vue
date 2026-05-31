<template>
  <div class="book-info" v-if="book">
    <img :src="book.coverUrl" class="cover" alt="" />
    <div class="meta">
      <h1 class="name">{{ book.name }}</h1>
      <p class="author">{{ book.author }}</p>
      <p class="kind">{{ book.kind }}</p>
      <p class="intro">{{ book.intro }}</p>
      <button v-if="!inShelf" @click="$emit('add')" class="btn-add">加入书架</button>
      <button v-else @click="$emit('read')" class="btn-read">开始阅读</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Book } from '@/types'
defineProps<{ book: Partial<Book> | null; inShelf?: boolean }>()
defineEmits<{ add: []; read: [] }>()
</script>

<style scoped>
.book-info { display: flex; gap: 20px; padding: 16px; }
.cover { width: 128px; height: 180px; object-fit: cover; border-radius: 4px; }
.name { font-size: 22px; margin: 0 0 8px; }
.author { color: #666; margin: 0 0 4px; }
.kind { color: #999; font-size: 13px; margin: 0 0 8px; }
.intro { color: #333; font-size: 14px; line-height: 1.6; margin: 8px 0; }
.btn-add, .btn-read { padding: 8px 24px; background: #1a1a2e; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
</style>
