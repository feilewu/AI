import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { BookSource } from '@/types'
import * as db from '@/db'
import { proxyFetch } from '@/api/proxy'
import { parseHeader } from '@/engine/header-parser'

export const useSourceStore = defineStore('source', () => {
  const sources = ref<BookSource[]>([])
  const loading = ref(false)

  async function loadSources() {
    loading.value = true
    sources.value = await db.getAllSources()
    loading.value = false
  }

  async function importFromUrl(url: string) {
    const res = await proxyFetch(url)
    const raw = JSON.parse(res.body)
    const list: BookSource[] = Array.isArray(raw) ? raw : [raw]
    for (const s of list) {
      if (s.header) {
        s.header = parseHeader(s.header as any)
      }
    }
    await db.importSources(list)
    await loadSources()
    return list.length
  }

  async function importFromFile(file: File): Promise<number> {
    const text = await file.text()
    const raw = JSON.parse(text)
    const list: BookSource[] = Array.isArray(raw) ? raw : [raw]
    for (const s of list) {
      if (s.header) {
        s.header = parseHeader(s.header as any)
      }
    }
    await db.importSources(list)
    await loadSources()
    return list.length
  }

  async function toggleEnabled(url: string, enabled: boolean) {
    await db.toggleSource(url, enabled)
    await loadSources()
  }

  async function removeSource(url: string) {
    await db.deleteSource(url)
    await loadSources()
  }

  return { sources, loading, loadSources, importFromUrl, importFromFile, toggleEnabled, removeSource }
})
