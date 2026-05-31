import { describe, it, expect } from 'vitest'
import { renderTemplate } from '@/engine/template'
import type { EngineContext, BookSource } from '@/types'

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
  ruleToc: {},
  ruleContent: {},
  lastUpdateTime: 0,
  respondTime: 0,
}

const mockCtx: EngineContext = {
  key: 'test keyword',
  page: 2,
  book: { name: '测试书名', author: '测试作者' },
  source: mockSource,
  result: { data: { list: ['a', 'b', 'c'] } },
  baseUrl: 'https://example.com',
  java: {} as any,
}

describe('renderTemplate', () => {
  it('替换 {{key}}', () => {
    expect(renderTemplate('/search?q={{key}}', mockCtx)).toBe('/search?q=test keyword')
  })

  it('替换 {{page}}', () => {
    expect(renderTemplate('/search?page={{page}}', mockCtx)).toBe('/search?page=2')
  })

  it('替换 {{book.name}}', () => {
    expect(renderTemplate('/book?name={{book.name}}', mockCtx)).toBe('/book?name=测试书名')
  })

  it('替换 {{book.author}}', () => {
    expect(renderTemplate('/book?author={{book.author}}', mockCtx)).toBe('/book?author=测试作者')
  })

  it('替换 {{source.bookSourceName}}', () => {
    expect(renderTemplate('/source?name={{source.bookSourceName}}', mockCtx)).toBe('/source?name=测试源')
  })

  it('替换 {{$.data.list}} JSONPath', () => {
    expect(renderTemplate('{{$.data.list}}', mockCtx)).toBe('a,b,c')
  })

  it('替换 {{baseUrl}}', () => {
    expect(renderTemplate('{{baseUrl}}/path', mockCtx)).toBe('https://example.com/path')
  })

  it('无模板变量返回原字符串', () => {
    expect(renderTemplate('/static/url', mockCtx)).toBe('/static/url')
  })

  it('不包含 {{ 直接返回', () => {
    expect(renderTemplate('hello world', mockCtx)).toBe('hello world')
  })
})
