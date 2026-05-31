<template>
  <div class="reader-page">
    <ReaderSettings v-if="showSettings" />

    <ReaderNav
      :chapters="chapters"
      :currentIndex="currentIndex"
      :hasPrev="currentIndex > 0"
      :hasNext="currentIndex < chapters.length - 1"
      @prev="goToChapter(currentIndex - 1)"
      @next="goToChapter(currentIndex + 1)"
      @jump="goToChapter"
    />

    <div v-if="loading" class="loading-text">加载中...</div>
    <ReaderContent v-else-if="content" :content="content" />

    <div class="reader-footer">
      <button @click="showSettings = !showSettings" class="footer-btn">
        {{ showSettings ? '关闭设置' : '设置' }}
      </button>
      <button @click="toggleTheme" class="footer-btn">
        {{ isDark ? '浅色' : '深色' }}主题
      </button>
      <button @click="openSourcePicker" class="footer-btn">换源</button>
    </div>

    <div v-if="showSourcePicker" class="source-picker-overlay" @click.self="showSourcePicker = false">
      <div class="source-picker">
        <h3>更换书源</h3>
        <div v-if="searchingSources">搜索可用书源...</div>
        <div v-else-if="availableSources.length === 0">未找到其他可用书源</div>
        <div
          v-for="item in availableSources"
          :key="item.source.bookSourceUrl"
          class="source-item"
          @click="switchToSource(item)"
        >
          <div class="source-name">{{ item.source.bookSourceName }}</div>
          <div class="source-book">{{ item.bookInfo.name }} - {{ item.bookInfo.author }}</div>
        </div>
        <button @click="showSourcePicker = false" class="close-btn">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import ReaderContent from '@/components/ReaderContent.vue'
import ReaderSettings from '@/components/ReaderSettings.vue'
import ReaderNav from '@/components/ReaderNav.vue'
import { useReaderStore } from '@/stores/reader-store'
import {
  getBook, getChapters, saveProgress, saveBook, saveChapters,
  switchBookSource, getEnabledSources,
} from '@/db'
import { proxyFetch } from '@/api/proxy'
import {
  parseContent, createBookContext, parseSearchResults,
  createSearchContext, parseBookInfo, parseToc, executeRule,
} from '@/engine/pipeline'
import type { Chapter, Book, BookSource } from '@/types'

const route = useRoute()
let bookId = route.params.bookId as string
const chapterIndex = Number(route.params.chapterIndex)

const store = useReaderStore()

const chapters = ref<Chapter[]>([])
const book = ref<Book | null>(null)
const content = ref('')
const loading = ref(true)
const currentIndex = ref(chapterIndex)
const showSettings = ref(false)
const isDark = ref(false)
const showSourcePicker = ref(false)
const availableSources = ref<any[]>([])
const searchingSources = ref(false)

const activeSource = ref<BookSource | null>(null)

onMounted(async () => {
  book.value = (await getBook(bookId)) || null
  if (book.value) {
    const sources = await getEnabledSources()
    activeSource.value = sources.find(s => s.bookSourceUrl === book.value!.activeSourceUrl) || null
    chapters.value = await getChapters(bookId, book.value.activeSourceUrl)
    await loadChapter(currentIndex.value)
  } else {
    loading.value = false
  }
})

async function loadChapter(index: number) {
  if (!book.value || !chapters.value[index]) return
  loading.value = true
  currentIndex.value = index

  try {
    const ch = chapters.value[index]
    const source = activeSource.value!
    const ctx = createBookContext(book.value, source, book.value.activeSourceUrl)
    const resp = await proxyFetch(ch.url, source.header)
    const result = await parseContent(resp.body, source, ctx)
    content.value = result.content

    await saveProgress({
      id: `${bookId}::${source.bookSourceUrl}`,
      bookId,
      sourceUrl: source.bookSourceUrl,
      chapterIndex: index,
      scrollPosition: 0,
      updatedAt: Date.now(),
    })
  } catch (e) {
    content.value = `加载失败: ${e}`
  }
  loading.value = false
}

async function goToChapter(index: number) {
  if (index < 0 || index >= chapters.value.length) return
  await loadChapter(index)
  window.scrollTo(0, 0)
}

function toggleTheme() {
  isDark.value = !isDark.value
  if (isDark.value) {
    store.setBgColor('#1a1a2e')
    store.setTextColor('#ccc')
  } else {
    store.setBgColor('#f5f0e8')
    store.setTextColor('#333')
  }
}

async function openSourcePicker() {
  showSourcePicker.value = true
  searchingSources.value = true
  availableSources.value = []

  const allSources = await getEnabledSources()
  const currentUrl = book.value?.activeSourceUrl
  const bookName = book.value?.name || ''
  const bookAuthor = book.value?.author || ''

  const promises = allSources
    .filter(s => s.bookSourceUrl !== currentUrl && s.searchUrl)
    .map(async (source) => {
      try {
        const ctx = createSearchContext(bookName, 1, source, source.bookSourceUrl)
        const searchUrl = await executeRule('', source.searchUrl!, ctx)
        if (!searchUrl) return null
        const resp = await proxyFetch(searchUrl, source.header)
        const results = await parseSearchResults(resp.body, source, ctx)
        const match = results.find(r =>
          r.name?.toLowerCase() === bookName.toLowerCase() &&
          r.author?.toLowerCase() === bookAuthor.toLowerCase()
        )
        if (match) {
          return { source, bookInfo: match }
        }
      } catch {}
      return null
    })

  const results = await Promise.all(promises)
  availableSources.value = results.filter(Boolean)
  searchingSources.value = false
}

async function switchToSource(item: any) {
  if (!book.value) return

  const newSource = item.source as BookSource
  const newBookId = item.bookInfo.bookUrl || ''

  const existingSources = book.value.sources.filter(s => s.sourceUrl !== newSource.bookSourceUrl)
  existingSources.push({
    sourceUrl: newSource.bookSourceUrl,
    bookId: newBookId,
    coverUrl: item.bookInfo.coverUrl,
    intro: item.bookInfo.intro,
  })

  book.value.sources = existingSources
  book.value.activeSourceUrl = newSource.bookSourceUrl
  activeSource.value = newSource

  await saveBook(book.value)
  await switchBookSource(book.value.id, newSource.bookSourceUrl)

  if (newBookId) {
    const detailResp = await proxyFetch(newBookId, newSource.header)
    const ctx = createBookContext(book.value, newSource, newSource.bookSourceUrl)
    const bookInfo = await parseBookInfo(detailResp.body, newSource, ctx)
    const tocUrl = bookInfo.tocUrl || ''

    if (tocUrl) {
      const tocResp = await proxyFetch(tocUrl, newSource.header)
      const newChapters = await parseToc(tocResp.body, newSource, ctx)
      chapters.value = newChapters
      await saveChapters(newChapters)

      if (newChapters.length > 0) {
        await loadChapter(0)
      }
    }
  }

  showSourcePicker.value = false
}

watch(() => [route.params.bookId, route.params.chapterIndex], async ([newBookId, newIdx]) => {
  if (newBookId !== bookId) {
    bookId = newBookId as string
    book.value = (await getBook(bookId)) || null
    if (book.value) {
      const sources = await getEnabledSources()
      activeSource.value = sources.find(s => s.bookSourceUrl === book.value!.activeSourceUrl) || null
      chapters.value = await getChapters(bookId, book.value.activeSourceUrl)
      currentIndex.value = Number(newIdx) || 0
      await loadChapter(currentIndex.value)
    }
  } else {
    const idx = Number(newIdx)
    if (idx !== currentIndex.value) {
      await goToChapter(idx)
    }
  }
})
</script>

<style scoped>
.reader-page { max-width: 800px; margin: 0 auto; min-height: 100vh; display: flex; flex-direction: column; }
.loading-text { padding: 48px; text-align: center; color: #999; }
.reader-footer { display: flex; justify-content: center; gap: 16px; padding: 16px; background: #fff; border-top: 1px solid #eee; position: sticky; bottom: 0; }
.footer-btn { padding: 8px 20px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; font-size: 13px; }
.source-picker-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
.source-picker { background: #fff; border-radius: 8px; padding: 20px; min-width: 300px; max-width: 90vw; max-height: 70vh; overflow-y: auto; }
.source-item { padding: 12px; border-bottom: 1px solid #eee; cursor: pointer; }
.source-item:hover { background: #f5f5f5; }
.source-name { font-weight: bold; }
.source-book { font-size: 13px; color: #666; }
.close-btn { margin-top: 12px; padding: 8px 24px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; width: 100%; }
</style>
