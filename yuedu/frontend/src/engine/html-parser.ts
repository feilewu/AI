import { load } from 'cheerio'
import type { SelectorStep } from '@/types'

function cssSelector(step: SelectorStep): string {
  switch (step.type) {
    case 'class': return `.${step.value}`
    case 'id': return `#${step.value}`
    case 'attribute': return `[${step.value}]`
    default: return step.value
  }
}

export function select(html: string, steps: SelectorStep[]): string[] {
  if (steps.length === 0) return []

  const $ = load(html)
  let $current: any

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const sel = cssSelector(step)
    const $found = i === 0 ? $(sel) : $current.find(sel)
    let items = $found.toArray()

    if (step.exclude !== null) {
      items = items.filter((_: any, idx: number) => idx !== step.exclude)
    }
    if (step.index !== null) {
      items = step.index < items.length ? [items[step.index]] : []
    }

    $current = $(items)
    if ($current.length === 0) return []
  }

  const attr = steps[steps.length - 1].attribute || 'text'

  return $current.toArray().map((el: any) => {
    const $el = $(el)
    if (attr === 'text') return $el.text()
    if (attr === 'html') return $el.html() ?? ''
    return $el.attr(attr) ?? ''
  })
}
