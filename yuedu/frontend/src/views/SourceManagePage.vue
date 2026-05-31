<template>
  <div class="source-manage">
    <h2>书源管理</h2>
    
    <div class="import-section">
      <input v-model="importUrl" placeholder="输入书源 JSON URL" />
      <button @click="handleImportUrl" :disabled="loading">导入</button>
      <input type="file" accept=".json" @change="handleImportFile" />
    </div>

    <div v-if="loading">加载中...</div>
    
    <table v-else class="source-table">
      <thead>
        <tr>
          <th>名称</th>
          <th>分组</th>
          <th>URL</th>
          <th>状态</th>
          <th>响应</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in store.sources" :key="s.bookSourceUrl">
          <td>{{ s.bookSourceName }}</td>
          <td>{{ s.bookSourceGroup }}</td>
          <td class="url-cell">{{ s.bookSourceUrl }}</td>
          <td>
            <label class="toggle">
              <input type="checkbox" :checked="s.enabled" @change="store.toggleEnabled(s.bookSourceUrl, !s.enabled)" />
              <span>{{ s.enabled ? '启用' : '禁用' }}</span>
            </label>
          </td>
          <td>{{ s.respondTime }}ms</td>
          <td><button @click="store.removeSource(s.bookSourceUrl)" class="btn-delete">删除</button></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSourceStore } from '@/stores/source-store'

const store = useSourceStore()
const importUrl = ref('')
const loading = ref(false)

onMounted(() => {
  store.loadSources()
})

async function handleImportUrl() {
  if (!importUrl.value) return
  loading.value = true
  try {
    await store.importFromUrl(importUrl.value)
    importUrl.value = ''
  } catch (e) {
    console.error('Import failed', e)
  } finally {
    loading.value = false
  }
}

async function handleImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  loading.value = true
  try {
    await store.importFromFile(file)
  } catch (e) {
    console.error('Import failed', e)
  } finally {
    loading.value = false;
    (e.target as HTMLInputElement).value = ''
  }
}
</script>

<style scoped>
.source-manage { padding: 16px; }
.import-section { display: flex; gap: 8px; margin-bottom: 16px; align-items: center; }
.source-table { width: 100%; border-collapse: collapse; }
.source-table th, .source-table td { padding: 8px; text-align: left; border-bottom: 1px solid #eee; }
.url-cell { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toggle { cursor: pointer; }
.btn-delete { color: red; cursor: pointer; }
</style>
