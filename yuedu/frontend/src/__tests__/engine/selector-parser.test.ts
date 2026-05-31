import { describe, it, expect } from 'vitest'
import { parseSelector } from '@/engine/selector-parser'

describe('parseSelector', () => {
  it('解析 class.xxx@text', () => {
    const result = parseSelector('class.book-name@text')
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0]).toMatchObject({
      type: 'class', value: 'book-name', attribute: 'text',
    })
  })

  it('解析 tag.a.0@href', () => {
    const result = parseSelector('tag.a.0@href')
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0]).toMatchObject({
      type: 'tag', value: 'a', index: 0, attribute: 'href',
    })
  })

  it('解析链式选择器 class.author@tag.a!0@text', () => {
    const result = parseSelector('class.author@tag.a!0@text')
    expect(result.steps).toHaveLength(2)
    expect(result.steps[0]).toMatchObject({ type: 'class', value: 'author' })
    expect(result.steps[1]).toMatchObject({
      type: 'tag', value: 'a', exclude: 0, attribute: 'text',
    })
  })

  it('解析正则后缀 ##pattern##replacement', () => {
    const result = parseSelector('class.name@text##\\s+##')
    expect(result.regexPattern).toBe('\\s+')
    expect(result.regexReplacement).toBe('')
  })

  it('空输入返回空 steps', () => {
    expect(parseSelector('').steps).toHaveLength(0)
    expect(parseSelector('  ').steps).toHaveLength(0)
  })

  it('无 @ 后缀默认 attribute 为 null', () => {
    const result = parseSelector('class.name')
    expect(result.steps[0].attribute).toBeNull()
  })

  it('解析 id.xxx@html', () => {
    const result = parseSelector('id.content@html')
    expect(result.steps[0]).toMatchObject({
      type: 'id', value: 'content', attribute: 'html',
    })
  })

  it('解析 index + exclude 组合', () => {
    const result = parseSelector('class.list.1!0@text')
    expect(result.steps[0]).toMatchObject({
      type: 'class', value: 'list', index: 1, exclude: 0,
    })
  })
})
