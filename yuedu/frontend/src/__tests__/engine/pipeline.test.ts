import { describe, it, expect } from 'vitest'
import { parseToc, parseContent, createSearchContext, createBookContext } from '@/engine/pipeline'
import type { BookSource } from '@/types'

const mockSource: BookSource = {
  bookSourceUrl: 'https://example.com',
  bookSourceName: '测试源',
  bookSourceGroup: '测试',
  bookSourceType: 0,
  enabled: true,
  customOrder: 0,
  weight: 0,
  ruleSearch: {},
  ruleBookInfo: {},
  ruleToc: {
    chapterList: 'class.chapter-item@html',
    chapterName: 'class.chapter-title@text',
    chapterUrl: 'tag.a@href',
  },
  ruleContent: {
    content: 'class.content@html',
  },
  lastUpdateTime: 0,
  respondTime: 0,
}

const tocHtml = `<div class="chapter-list">
  <div class="chapter-item">
    <span class="chapter-title">第一章</span>
    <a href="/chapter/1">阅读</a>
  </div>
  <div class="chapter-item">
    <span class="chapter-title">第二章</span>
    <a href="/chapter/2">阅读</a>
  </div>
</div>`

describe('parseToc', () => {
  it('解析章节列表并生成正确 ID', async () => {
    const ctx = createBookContext({ id: 'book123' }, mockSource, 'https://example.com')
    const chapters = await parseToc(tocHtml, mockSource, ctx)

    expect(chapters).toHaveLength(2)
    expect(chapters[0]).toMatchObject({
      id: 'book123::https://example.com::0',
      bookId: 'book123',
      sourceUrl: 'https://example.com',
      index: 0,
      title: '第一章',
      url: '/chapter/1',
    })
    expect(chapters[1]).toMatchObject({
      id: 'book123::https://example.com::1',
      index: 1,
      title: '第二章',
      url: '/chapter/2',
    })
  })

  it('空的章节列表返回空数组', async () => {
    const ctx = createBookContext({ id: 'book123' }, mockSource, 'https://example.com')
    const source = { ...mockSource, ruleToc: { chapterList: '', chapterName: '', chapterUrl: '' } }
    const chapters = await parseToc('<div></div>', source, ctx)
    expect(chapters).toHaveLength(0)
  })
})

describe('parseContent', () => {
  it('提取正文内容', async () => {
    const ctx = createBookContext({ id: 'book123' }, mockSource, 'https://example.com')
    const html = '<div class="content"><p>这是正文内容</p></div>'
    const result = await parseContent(html, mockSource, ctx)
    expect(result.content).toContain('这是正文内容')
    expect(result.nextUrl).toBeUndefined()
  })

  it('无 content 规则返回空字符串', async () => {
    const ctx = createBookContext({ id: 'book123' }, mockSource, 'https://example.com')
    const source = { ...mockSource, ruleContent: { content: '' } }
    const result = await parseContent('<div></div>', source, ctx)
    expect(result.content).toBe('')
  })
})

describe('createSearchContext', () => {
  it('创建搜索上下文', () => {
    const ctx = createSearchContext('keyword', 1, mockSource, 'https://example.com')
    expect(ctx.key).toBe('keyword')
    expect(ctx.page).toBe(1)
    expect(ctx.source.bookSourceName).toBe('测试源')
  })
})
