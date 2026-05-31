import { describe, it, expect } from 'vitest'
import { selectByJSONPath } from '@/engine/jsonpath-parser'

describe('selectByJSONPath', () => {
  const data = { data: { list: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] } }

  it('提取 $.data.list[*].name', () => {
    expect(selectByJSONPath(data, '$.data.list[*].name')).toEqual(['A', 'B'])
  })

  it('提取 $.data.list[0]', () => {
    expect(selectByJSONPath(data, '$.data.list[0]')).toEqual([{ id: 1, name: 'A' }])
  })

  it('无效路径返回空数组', () => {
    expect(selectByJSONPath(data, '$.nonexistent')).toEqual([])
  })

  it('空 path 返回空数组', () => {
    expect(selectByJSONPath(data, '')).toEqual([])
  })
})
