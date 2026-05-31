<template>
  <div class="search-bar">
    <input
      v-model="keyword"
      @keyup.enter="$emit('search', keyword)"
      placeholder="输入书名或作者搜索..."
      class="search-input"
    />
    <button @click="$emit('search', keyword)" class="search-btn">搜索</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
const keyword = ref('')
defineEmits<{ search: [keyword: string] }>()
</script>

<style scoped>
.search-bar { display: flex; gap: 8px; padding: 12px; }
.search-input { flex: 1; padding: 8px 12px; font-size: 16px; border: 1px solid #ccc; border-radius: 4px; }
.search-btn { padding: 8px 20px; background: #1a1a2e; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
</style>
