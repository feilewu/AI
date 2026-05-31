import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SearchBar from '@/components/SearchBar.vue'

describe('SearchBar', () => {
  it('输入关键词后回车触发 search 事件', async () => {
    const wrapper = mount(SearchBar)
    const input = wrapper.find('input')
    await input.setValue('测试关键词')
    await input.trigger('keyup.enter')
    expect(wrapper.emitted('search')).toBeTruthy()
    expect(wrapper.emitted('search')![0]).toEqual(['测试关键词'])
  })

  it('点击按钮触发 search 事件', async () => {
    const wrapper = mount(SearchBar)
    const input = wrapper.find('input')
    await input.setValue('点击搜索')
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('search')![0]).toEqual(['点击搜索'])
  })

  it('渲染输入框和按钮', () => {
    const wrapper = mount(SearchBar)
    expect(wrapper.find('input').exists()).toBe(true)
    expect(wrapper.find('button').exists()).toBe(true)
    expect(wrapper.find('button').text()).toBe('搜索')
  })
})
