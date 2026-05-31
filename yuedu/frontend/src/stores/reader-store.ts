import { defineStore } from 'pinia'
import { ref } from 'vue'

const SETTINGS_KEY = 'yuedu-reader-settings'

interface ReaderSettings {
  fontSize: number
  fontFamily: string
  lineHeight: number
  bgColor: string
  textColor: string
}

function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { fontSize: 18, fontFamily: 'sans-serif', lineHeight: 1.8, bgColor: '#f5f0e8', textColor: '#333' }
}

export const useReaderStore = defineStore('reader', () => {
  const settings = ref<ReaderSettings>(loadSettings())

  function save() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings.value))
  }

  function setFontSize(px: number) { settings.value.fontSize = Math.max(12, Math.min(32, px)); save() }
  function setFontFamily(font: string) { settings.value.fontFamily = font; save() }
  function setLineHeight(lh: number) { settings.value.lineHeight = lh; save() }
  function setBgColor(color: string) { settings.value.bgColor = color; save() }
  function setTextColor(color: string) { settings.value.textColor = color; save() }

  return { settings, setFontSize, setFontFamily, setLineHeight, setBgColor, setTextColor }
})
