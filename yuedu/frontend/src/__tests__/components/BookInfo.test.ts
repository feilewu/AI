import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BookInfo from '@/components/BookInfo.vue'

const book = {
  id: '1',
  name: '测试书名',
  author: '测试作者',
  kind: '玄幻',
  intro: '这是一本很好看的书',
  coverUrl: 'https://example.com/cover.jpg',
} as any

describe('BookInfo', () => {
  it('渲染书籍信息', () => {
    const wrapper = mount(BookInfo, { props: { book } })
    expect(wrapper.text()).toContain('测试书名')
    expect(wrapper.text()).toContain('测试作者')
    expect(wrapper.text()).toContain('玄幻')
    expect(wrapper.text()).toContain('这是一本很好看的书')
  })

  it('未加入书架时显示加入书架按钮', () => {
    const wrapper = mount(BookInfo, { props: { book } })
    expect(wrapper.find('.btn-add').exists()).toBe(true)
    expect(wrapper.find('.btn-read').exists()).toBe(false)
  })

  it('已加入书架时显示开始阅读按钮', () => {
    const wrapper = mount(BookInfo, { props: { book, inShelf: true } })
    expect(wrapper.find('.btn-read').exists()).toBe(true)
    expect(wrapper.find('.btn-add').exists()).toBe(false)
  })

  it('点击加入书架 emit add', async () => {
    const wrapper = mount(BookInfo, { props: { book } })
    await wrapper.find('.btn-add').trigger('click')
    expect(wrapper.emitted('add')).toBeTruthy()
  })
})
