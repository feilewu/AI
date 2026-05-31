import type { ParsedSelector, SelectorType, SelectorStep } from '../types'

const KNOWN_ATTRIBUTES = [
  'text',
  'html',
  'href',
  'src',
  'content',
  'src2',
  'src3',
  'alt',
  'title',
  'data-src',
  'data-original',
]

function parseStep(segment: string): SelectorStep {
  let rest = segment

  let exclude: number | null = null
  const excludeMatch = rest.match(/!(\d+)$/)
  if (excludeMatch) {
    exclude = parseInt(excludeMatch[1], 10)
    rest = rest.slice(0, excludeMatch.index)
  }

  let index: number | null = null
  const indexMatch = rest.match(/\.(\d+)$/)
  if (indexMatch) {
    index = parseInt(indexMatch[1], 10)
    rest = rest.slice(0, indexMatch.index)
  }

  let type: SelectorType = 'tag'
  let value: string

  if (rest.startsWith('class.')) {
    type = 'class'
    value = rest.slice(6)
  } else if (rest.startsWith('id.')) {
    type = 'id'
    value = rest.slice(3)
  } else if (rest.startsWith('tag.')) {
    type = 'tag'
    value = rest.slice(4)
  } else {
    value = rest
  }

  return { type, value, index, exclude, attribute: null }
}

export function parseSelector(input: string): ParsedSelector {
  const trimmed = (input ?? '').trim()
  if (!trimmed) return { steps: [] }

  let selectorPart = trimmed
  let regexPattern: string | undefined
  let regexReplacement: string | undefined

  const firstHash = trimmed.indexOf('##')
  if (firstHash !== -1) {
    selectorPart = trimmed.slice(0, firstHash)
    const afterFirst = trimmed.slice(firstHash + 2)
    const secondHash = afterFirst.indexOf('##')
    if (secondHash !== -1) {
      regexPattern = afterFirst.slice(0, secondHash)
      regexReplacement = afterFirst.slice(secondHash + 2)
    } else {
      regexPattern = afterFirst
      regexReplacement = ''
    }
  }

  const segments = selectorPart.split('@')

  let attribute: string | null = null

  if (segments.length > 1) {
    const last = segments[segments.length - 1]
    if (KNOWN_ATTRIBUTES.includes(last)) {
      attribute = last
      segments.pop()
    }
  }

  const steps: SelectorStep[] = []
  for (const s of segments) {
    const step = s.trim()
    if (step) {
      steps.push(parseStep(step))
    }
  }

  if (attribute !== null && steps.length > 0) {
    steps[steps.length - 1].attribute = attribute
  }

  return { steps, regexPattern, regexReplacement }
}
