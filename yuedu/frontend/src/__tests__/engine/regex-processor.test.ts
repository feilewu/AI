import { describe, it, expect } from 'vitest'
import { applyRegex } from '@/engine/regex-processor'

describe('applyRegex', () => {
  it('替换匹配内容', () => {
    expect(applyRegex('abc123def', '\\d+', '数字')).toBe('abc数字def')
  })

  it('全局替换', () => {
    expect(applyRegex('a1b2c3', '\\d', 'X')).toBe('aXbXcX')
  })

  it('无匹配返回原字符串', () => {
    expect(applyRegex('abcdef', '\\d+', 'X')).toBe('abcdef')
  })

  it('空 pattern 返回原字符串', () => {
    expect(applyRegex('abcdef', '', 'X')).toBe('abcdef')
  })

  it('无效正则返回原字符串', () => {
    expect(applyRegex('abcdef', '[invalid', 'X')).toBe('abcdef')
  })
})
