<template>
  <div class="bookshelf">
    <h2>我的书架</h2>

    <div v-if="loading">加载中...</div>

    <div v-else-if="store.books.length === 0" class="empty-shelf">
      <p>书架是空的</p>
      <router-link to="/search" class="go-search">去搜书</router-link>
    </div>

    <div v-else class="book-list">
      <BookCard
        v-for="book in store.books"
        :key="book.id"
        :book="book"
        :lastChapter="book.lastChapter"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import BookCard from '@/components/BookCard.vue'
import { useBookStore } from '@/stores/book-store'

const store = useBookStore()
const loading = ref(true)

onMounted(async () => {
  await store.loadBooks()
  loading.value = false
})
</script>

<style scoped>
.bookshelf { max-width: 800px; margin: 0 auto; padding: 16px; }
h2 { margin: 0 0 16px; }
.empty-shelf { text-align: center; padding: 48px; color: #999; }
.go-search { display: inline-block; margin-top: 12px; padding: 8px 24px; background: #1a1a2e; color: #fff; text-decoration: none; border-radius: 4px; }
</style>
