import { describe, it, expect } from 'vitest'
import { select } from '@/engine/html-parser'

const html = `<div class="book-list">
  <div class="item">
    <span class="name">书名A</span>
    <span class="author">作者A</span>
    <a href="/book/1">详情</a>
  </div>
  <div class="item">
    <span class="name">书名B</span>
    <span class="author">作者B</span>
    <a href="/book/2">详情</a>
  </div>
</div>`

describe('select', () => {
  it('通过 class 提取 text', () => {
    const result = select(html, [
      { type: 'class', value: 'name', index: null, exclude: null, attribute: 'text' },
    ])
    expect(result).toEqual(['书名A', '书名B'])
  })

  it('通过 tag 提取 href', () => {
    const result = select(html, [
      { type: 'tag', value: 'a', index: null, exclude: null, attribute: 'href' },
    ])
    expect(result).toEqual(['/book/1', '/book/2'])
  })

  it('index 参数取第 N 个', () => {
    const result = select(html, [
      { type: 'class', value: 'name', index: 1, exclude: null, attribute: 'text' },
    ])
    expect(result).toEqual(['书名B'])
  })

  it('exclude 排除第 N 个', () => {
    const result = select(html, [
      { type: 'class', value: 'name', index: null, exclude: 0, attribute: 'text' },
    ])
    expect(result).toEqual(['书名B'])
  })

  it('链式选择器 class.item → tag.a@href', () => {
    const result = select(html, [
      { type: 'class', value: 'item', index: null, exclude: null, attribute: null },
      { type: 'tag', value: 'a', index: null, exclude: null, attribute: 'href' },
    ])
    expect(result).toEqual(['/book/1', '/book/2'])
  })

  it('无效选择器返回空数组', () => {
    const result = select(html, [
      { type: 'class', value: 'nonexistent', index: null, exclude: null, attribute: 'text' },
    ])
    expect(result).toEqual([])
  })

  it('空 steps 返回空数组', () => {
    expect(select(html, [])).toEqual([])
  })

  it('提取 html 属性', () => {
    const result = select(html, [
      { type: 'class', value: 'item', index: 0, exclude: null, attribute: 'html' },
    ])
    expect(result[0]).toContain('书名A')
    expect(result[0]).toContain('作者A')
  })
})
