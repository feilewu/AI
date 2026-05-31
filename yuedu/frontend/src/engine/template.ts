import type { EngineContext } from '@/types'
import { selectByJSONPath } from './jsonpath-parser'

export function renderTemplate(template: string, ctx: EngineContext): string {
  if (!template.includes('{{')) return template

  return template.replace(/\{\{(.+?)\}\}/g, (_, expr: string) => {
    const trimmed = expr.trim()

    if (trimmed === 'key') return ctx.key
    if (trimmed === 'page') return String(ctx.page)
    if (trimmed === 'baseUrl') return ctx.baseUrl

    if (trimmed.startsWith('$.')) {
      try {
        const result = selectByJSONPath(ctx.result, trimmed)
        return result?.[0] !== undefined ? String(result[0]) : ''
      } catch {
        return ''
      }
    }

    if (trimmed.startsWith('book.')) {
      const field = trimmed.slice(5)
      return ctx.book?.[field] !== undefined ? String(ctx.book[field]) : ''
    }

    if (trimmed.startsWith('source.')) {
      const field = trimmed.slice(7)
      return (ctx.source as any)?.[field] !== undefined
        ? String((ctx.source as any)[field])
        : ''
    }

    return ''
  })
}
