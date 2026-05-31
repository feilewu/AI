import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import BookCard from '@/components/BookCard.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/book/:id', name: 'book-detail', component: {} as any }],
})

describe('BookCard', () => {
  it('渲染书名和作者', () => {
    const wrapper = mount(BookCard, {
      global: { plugins: [router] },
      props: {
        book: { id: '1', name: '测试书名', author: '测试作者' } as any,
      },
    })
    expect(wrapper.text()).toContain('测试书名')
    expect(wrapper.text()).toContain('测试作者')
  })

  it('无封面时显示占位符', () => {
    const wrapper = mount(BookCard, {
      global: { plugins: [router] },
      props: {
        book: { id: '1', name: '测试', author: '作者' } as any,
      },
    })
    expect(wrapper.find('.card-cover-placeholder').exists()).toBe(true)
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('有封面时显示图片', () => {
    const wrapper = mount(BookCard, {
      global: { plugins: [router] },
      props: {
        book: { id: '1', name: '测试', author: '作者', coverUrl: 'https://example.com/cover.jpg' } as any,
      },
    })
    expect(wrapper.find('img').exists()).toBe(true)
    expect(wrapper.find('img').attributes('src')).toBe('https://example.com/cover.jpg')
  })
})
