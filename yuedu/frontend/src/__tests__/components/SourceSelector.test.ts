import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import SourceSelector from '@/components/SourceSelector.vue'
import { useSourceStore } from '@/stores/source-store'

describe('SourceSelector', () => {
  it('渲染启用的书源', async () => {
    const pinia = createPinia()
    const store = useSourceStore(pinia)
    store.sources = [
      { bookSourceUrl: 's1', bookSourceName: '源1', enabled: true } as any,
      { bookSourceUrl: 's2', bookSourceName: '源2', enabled: true } as any,
      { bookSourceUrl: 's3', bookSourceName: '源3', enabled: false } as any,
    ]

    const wrapper = mount(SourceSelector, { global: { plugins: [pinia] } })
    await wrapper.vm.$nextTick()
    const labels = wrapper.findAll('.source-option')
    expect(labels).toHaveLength(2)
  })
})
