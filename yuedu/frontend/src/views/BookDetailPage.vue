<template>
  <div class="book-detail">
    <div v-if="loading">加载中...</div>
    <template v-else-if="book">
      <BookInfo :book="book" :inShelf="inShelf" @add="addToShelf" @read="startReading" />
      <h3>目录 ({{ chapters.length }}章)</h3>
      <ChapterList :chapters="chapters" @select="selectChapter" />
    </template>
    <div v-else class="not-found">未找到书籍</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BookInfo from '@/components/BookInfo.vue'
import ChapterList from '@/components/ChapterList.vue'
import { getBook, saveBook, getChapters, saveChapters, getEnabledSources } from '@/db'
import { proxyFetch } from '@/api/proxy'
import { parseBookInfo, parseToc, createBookContext, executeRule } from '@/engine/pipeline'
import type { Book, Chapter } from '@/types'

const route = useRoute()
const router = useRouter()
const bookId = route.params.id as string

const book = ref<Partial<Book> | null>(null)
const chapters = ref<Chapter[]>([])
const loading = ref(true)
const inShelf = ref(false)

onMounted(async () => {
  const existing = await getBook(bookId)
  if (existing) {
    book.value = existing
    inShelf.value = true
    chapters.value = await getChapters(bookId, existing.activeSourceUrl)
    loading.value = false
    return
  }

  // Coming from search page - try to retrieve cached book data
  const pendingKey = `pending-book-${bookId}`
  const pending = sessionStorage.getItem(pendingKey)
  if (pending) {
    try {
      const data = JSON.parse(pending)
      sessionStorage.removeItem(pendingKey)
      book.value = data
      // Fetch detailed book info and chapters from source
      await fetchBookFromSource(data)
    } catch {
      loading.value = false
    }
    return
  }

  loading.value = false
})

async function fetchBookFromSource(partial: Partial<Book>) {
  if (!partial.sources || partial.sources.length === 0) {
    loading.value = false
    return
  }

  const sources = await getEnabledSources()
  const ref = partial.sources[0]
  const source = sources.find(s => s.bookSourceUrl === ref.sourceUrl)
  if (!source) {
    loading.value = false
    return
  }

  const baseUrl = source.bookSourceUrl.replace(/\/+$/, '')
  const ctx = createBookContext(partial, source, baseUrl)

  try {
    const fullUrl = ref.bookId.startsWith('http') ? ref.bookId : baseUrl + '/' + ref.bookId.replace(/^\//, '')
    const resp = await proxyFetch(fullUrl, source.header)
    const info = await parseBookInfo(resp.body, source, ctx)
    Object.assign(partial, info)
    partial.activeSourceUrl = source.bookSourceUrl
    book.value = partial

    const tocUrlStr = info.tocUrl
    if (tocUrlStr) {
      const fullTocUrl = tocUrlStr.startsWith('http') ? tocUrlStr : baseUrl + '/' + tocUrlStr.replace(/^\//, '')
      const tocResp = await proxyFetch(fullTocUrl, source.header)
      const tocCtx = createBookContext(partial, source, baseUrl)
      const chapterList = await parseToc(tocResp.body, source, tocCtx)
      chapters.value = chapterList
      await saveChapters(chapterList)
    }
  } catch {
    loading.value = false
  }

  loading.value = false
}

async function addToShelf() {
  if (!book.value) return
  const fullBook: Book = {
    id: bookId,
    name: book.value.name || '',
    author: book.value.author || '',
    sources: book.value.sources || [],
    activeSourceUrl: book.value.activeSourceUrl || '',
    coverUrl: book.value.coverUrl,
    intro: book.value.intro,
    kind: book.value.kind,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await saveBook(fullBook)
  inShelf.value = true
}

function startReading() {
  if (chapters.value.length > 0) {
    router.push(`/read/${bookId}/${chapters.value[0].index}`)
  }
}

function selectChapter(ch: Chapter) {
  router.push(`/read/${bookId}/${ch.index}`)
}
</script>

<style scoped>
.book-detail { max-width: 800px; margin: 0 auto; }
.loading, .not-found { padding: 48px; text-align: center; color: #999; }
h3 { padding: 16px; margin: 0; font-size: 18px; border-top: 1px solid #eee; }
</style>
