import { describe, it, expect } from 'vitest'
import { selectByXPath } from '@/engine/xpath-parser'

describe('selectByXPath', () => {
  it('提取 meta 标签 content', () => {
    const html = '<html><head><meta property="og:title" content="测试标题"/></head></html>'
    const result = selectByXPath(html, '//meta[@property="og:title"]/@content')
    expect(result).toEqual(['测试标题'])
  })

  it('提取文本内容', () => {
    const html = '<div><p>段落1</p><p>段落2</p></div>'
    const result = selectByXPath(html, '//p/text()')
    expect(result).toEqual(['段落1', '段落2'])
  })

  it('无效 XPath 返回空数组', () => {
    expect(selectByXPath('<div></div>', '//invalid[')).toEqual([])
  })

  it('空输入返回空数组', () => {
    expect(selectByXPath('', '//div')).toEqual([])
  })
})
