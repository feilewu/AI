import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChapterList from '@/components/ChapterList.vue'

const chapters = [
  { id: '1', bookId: 'b1', sourceUrl: 's1', index: 0, title: '第一章', url: '/c1', isVip: false },
  { id: '2', bookId: 'b1', sourceUrl: 's1', index: 1, title: '第二章', url: '/c2', isVip: true },
] as any

describe('ChapterList', () => {
  it('渲染所有章节', () => {
    const wrapper = mount(ChapterList, { props: { chapters } })
    expect(wrapper.text()).toContain('第一章')
    expect(wrapper.text()).toContain('第二章')
    expect(wrapper.findAll('.chapter-item')).toHaveLength(2)
  })

  it('VIP 章节显示标签', () => {
    const wrapper = mount(ChapterList, { props: { chapters } })
    expect(wrapper.find('.ch-vip').exists()).toBe(true)
  })

  it('点击章节 emit select', async () => {
    const wrapper = mount(ChapterList, { props: { chapters } })
    await wrapper.findAll('.chapter-item')[0].trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')![0]).toEqual([chapters[0]])
  })

  it('空列表显示暂无章节', () => {
    const wrapper = mount(ChapterList, { props: { chapters: [] } })
    expect(wrapper.text()).toContain('暂无章节')
  })
})
