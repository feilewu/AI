<template>
  <div class="reader-settings">
    <div class="setting-row">
      <label>字号</label>
      <div class="row-controls">
        <button @click="store.setFontSize(store.settings.fontSize - 2)">A-</button>
        <span>{{ store.settings.fontSize }}px</span>
        <button @click="store.setFontSize(store.settings.fontSize + 2)">A+</button>
      </div>
    </div>

    <div class="setting-row">
      <label>行距</label>
      <select :value="store.settings.lineHeight" @change="e => store.setLineHeight(Number((e.target as HTMLSelectElement).value))">
        <option :value="1">1.0x</option>
        <option :value="1.25">1.25x</option>
        <option :value="1.5">1.5x</option>
        <option :value="1.75">1.75x</option>
        <option :value="2">2.0x</option>
      </select>
    </div>

    <div class="setting-row">
      <label>背景</label>
      <div class="color-presets">
        <button v-for="preset in bgPresets" :key="preset.bg"
          :style="{ background: preset.bg, color: preset.text, border: store.settings.bgColor === preset.bg ? '2px solid #333' : '1px solid #ccc' }"
          @click="store.setBgColor(preset.bg); store.setTextColor(preset.text)"
          class="color-btn">
          {{ preset.label }}
        </button>
      </div>
    </div>

    <div class="setting-row">
      <label>字体</label>
      <select :value="store.settings.fontFamily" @change="e => store.setFontFamily((e.target as HTMLSelectElement).value)">
        <option value="sans-serif">默认</option>
        <option value="'Noto Serif CJK SC', serif">宋体</option>
        <option value="'Noto Sans CJK SC', sans-serif">黑体</option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useReaderStore } from '@/stores/reader-store'

const store = useReaderStore()

const bgPresets = [
  { bg: '#f5f0e8', text: '#333', label: '护眼' },
  { bg: '#fff', text: '#333', label: '白' },
  { bg: '#fef6e3', text: '#8b6b4a', label: '黄' },
  { bg: '#e8f5e9', text: '#333', label: '绿' },
  { bg: '#e3f2fd', text: '#333', label: '蓝' },
  { bg: '#1a1a2e', text: '#ccc', label: '暗' },
]
</script>

<style scoped>
.reader-settings { padding: 16px; background: #fff; border-bottom: 1px solid #eee; }
.setting-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.row-controls { display: flex; align-items: center; gap: 8px; }
.color-presets { display: flex; gap: 6px; flex-wrap: wrap; }
.color-btn { width: 36px; height: 36px; border-radius: 50%; cursor: pointer; font-size: 10px; display: flex; align-items: center; justify-content: center; }
</style>
