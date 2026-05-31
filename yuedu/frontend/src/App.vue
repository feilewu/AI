<template>
  <div id="app-root">
    <AppHeader />
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import AppHeader from './components/AppHeader.vue'
import { useSourceStore } from '@/stores/source-store'
import { getSourceCount, importSources } from '@/db'
import { proxyFetch } from '@/api/proxy'
import { parseHeader } from '@/engine/header-parser'

const sourceStore = useSourceStore()

const PRESET_URL = 'https://cdn.jsdmirror.com/gh/XIU2/Yuedu/shuyuan'

onMounted(async () => {
  const count = await getSourceCount()
  if (count === 0) {
    try {
      const resp = await proxyFetch(PRESET_URL)
      const raw = JSON.parse(resp.body)
      const sources = Array.isArray(raw) ? raw : [raw]
      for (const s of sources) {
        if (s.header) {
          s.header = parseHeader(s.header as any)
        }
      }
      await importSources(sources)
      await sourceStore.loadSources()
      console.log(`Imported ${sources.length} preset book sources`)
    } catch (e) {
      console.error('Failed to import preset sources:', e)
    }
  } else {
    await sourceStore.loadSources()
  }
})
</script>
