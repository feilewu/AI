<template>
  <div class="search-page">
    <SearchBar @search="handleSearch" />
    <SourceSelector ref="sourceSelector" />

    <div v-if="searching" class="search-status">搜索中...</div>
    <div v-else-if="error" class="search-error">{{ error }}</div>

    <div v-if="results.length > 0" class="results">
      <BookListItem
        v-for="(book, i) in results"
        :key="i"
        :book="book"
        @select="handleSelect"
      />
    </div>
    <div v-else-if="!searching && searched" class="no-results">没有找到结果</div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import SearchBar from '@/components/SearchBar.vue'
import SourceSelector from '@/components/SourceSelector.vue'
import BookListItem from '@/components/BookListItem.vue'
import { proxyFetch } from '@/api/proxy'
import { executeRule, parseSearchResults, createSearchContext } from '@/engine/pipeline'
import type { Book } from '@/types'
import { useSourceStore } from '@/stores/source-store'
import { hashBookId } from '@/utils'

const router = useRouter()
const sourceStore = useSourceStore()
const sourceSelector = ref<InstanceType<typeof SourceSelector> | null>(null)

const results = ref<any[]>([])
const searching = ref(false)
const searched = ref(false)
const error = ref('')

async function handleSearch(keyword: string) {
  if (!keyword.trim()) return
  searching.value = true
  error.value = ''
  results.value = []
  searched.value = true

  const selectedUrls = sourceSelector.value?.selected || []
  const allSources = sourceStore.sources.filter(s => selectedUrls.includes(s.bookSourceUrl))

  const searchPromises = allSources.map(source =>
    searchSource(keyword, source).catch(() => [])
  )

  const nestedResults = await Promise.all(searchPromises)

  const seen = new Set<string>()
  for (const items of nestedResults) {
    for (const item of items) {
      const key = ((item.name || '') + '::' + (item.author || '')).toLowerCase().trim()
      if (!seen.has(key)) {
        seen.add(key)
        results.value.push(item)
      }
    }
  }

  searching.value = false
}

async function searchSource(keyword: string, source: any): Promise<any[]> {
  const searchUrl = source.searchUrl
  if (!searchUrl) return []

  const baseUrl = source.bookSourceUrl
  const ctx = createSearchContext(keyword, 1, source, baseUrl)

  const url = await executeRule('', searchUrl, ctx)
  if (!url || typeof url !== 'string') return []

  const resp = await proxyFetch(url, source.header)

  const resultCtx = createSearchContext(keyword, 1, source, baseUrl)
  const books = await parseSearchResults(resp.body, source, resultCtx)

  return books.map(b => ({ ...b, sourceName: source.bookSourceName, sourceUrl: source.bookSourceUrl }))
}

async function handleSelect(book: any) {
  const bookId = await hashBookId(book.name || '', book.author || '')

  const pending = {
    id: bookId,
    name: book.name || '',
    author: book.author || '',
    coverUrl: book.coverUrl,
    intro: book.intro,
    kind: book.kind,
    sources: [{
      sourceUrl: book.sourceUrl || '',
      bookId: book.bookUrl || '',
      coverUrl: book.coverUrl,
      intro: book.intro,
    }],
    activeSourceUrl: book.sourceUrl || '',
    sourceName: book.sourceName || '',
  }
  sessionStorage.setItem(`pending-book-${bookId}`, JSON.stringify(pending))
  router.push(`/book/${bookId}`)
}
</script>

<style scoped>
.search-page { max-width: 800px; margin: 0 auto; }
.search-status, .search-error, .no-results { padding: 24px; text-align: center; color: #999; }
.search-error { color: red; }
</style>
