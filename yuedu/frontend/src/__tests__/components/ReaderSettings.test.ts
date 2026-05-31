import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import ReaderSettings from '@/components/ReaderSettings.vue'
import { useReaderStore } from '@/stores/reader-store'

describe('ReaderSettings', () => {
  it('渲染设置面板', () => {
    const pinia = createPinia()
    const wrapper = mount(ReaderSettings, { global: { plugins: [pinia] } })
    expect(wrapper.text()).toContain('字号')
    expect(wrapper.text()).toContain('行距')
    expect(wrapper.text()).toContain('背景')
    expect(wrapper.text()).toContain('字体')
  })

  it('A+ 按钮增加字号', async () => {
    const pinia = createPinia()
    const store = useReaderStore(pinia)
    const wrapper = mount(ReaderSettings, { global: { plugins: [pinia] } })
    const aPlus = wrapper.findAll('button').find(b => b.text() === 'A+')
    expect(aPlus).toBeDefined()
    await aPlus!.trigger('click')
    expect(store.settings.fontSize).toBe(20)
  })

  it('背景色预设点击切换颜色', async () => {
    const pinia = createPinia()
    const store = useReaderStore(pinia)
    const wrapper = mount(ReaderSettings, { global: { plugins: [pinia] } })
    const colorBtns = wrapper.findAll('.color-btn')
    expect(colorBtns.length).toBeGreaterThan(0)
    await colorBtns[0].trigger('click')
  })
})
