import type { EngineContext, BookSource, Book, Chapter, JavaMock } from '@/types'
import { parseSelector } from './selector-parser'
import { select } from './html-parser'
import { selectByXPath } from './xpath-parser'
import { selectByJSONPath } from './jsonpath-parser'
import { renderTemplate } from './template'
import { applyRegex } from './regex-processor'
import { executeJS, extractJS, stripJSMarker } from './js-sandbox'

function createDefaultJavaMock(): JavaMock {
  return {
    getElement: () => [],
    toast: () => {},
    longToast: () => {},
    ajax: () => '',
    get: () => null,
    put: () => {},
    base64Encode: (data: string) => btoa(data),
    hexDecodeToString: () => '',
    startBrowserAwait: () => {},
    setContent: () => {},
    timeFormat: () => '',
    androidId: () => null,
  }
}

export function createSearchContext(
  keyword: string,
  page: number,
  source: BookSource,
  baseUrl: string
): EngineContext {
  return {
    key: keyword,
    page,
    book: {},
    source,
    result: null,
    baseUrl,
    java: createDefaultJavaMock(),
  }
}

export function createBookContext(
  book: Record<string, any>,
  source: BookSource,
  baseUrl: string
): EngineContext {
  return {
    key: '',
    page: 1,
    book,
    source,
    result: null,
    baseUrl,
    java: createDefaultJavaMock(),
  }
}

function tryParseJSON(str: string): any | null {
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}

export async function executeRule(
  rawContent: string,
  ruleExpression: string,
  ctx: EngineContext
): Promise<any> {
  if (!ruleExpression) return ''

  if (ruleExpression.includes('<js>')) {
    const script = extractJS(ruleExpression)
    return executeJS(script, ctx)
  }

  if (ruleExpression.startsWith('@js:')) {
    const script = stripJSMarker(ruleExpression)
    return executeJS(script, ctx)
  }

  const putMatch = ruleExpression.match(/@put:\{(\w+):(.+)\}$/)
  if (putMatch) {
    const [, key, expr] = putMatch
    const result = await executeRule(rawContent, expr.trim(), ctx)
    ctx.java.put(key, result)
    return result
  }

  if (ruleExpression.includes('||')) {
    let current = rawContent
    for (const part of ruleExpression.split('||')) {
      current = await executeRule(current, part.trim(), ctx)
    }
    return current
  }

  const rendered = renderTemplate(ruleExpression, ctx)
  if (rendered !== ruleExpression) {
    if (rendered.startsWith('http://') || rendered.startsWith('https://')) {
      return rendered
    }
    if (rendered.startsWith('/')) {
      return ctx.baseUrl.replace(/\/+$/, '') + rendered
    }
  }

  const isJson = tryParseJSON(rawContent) !== null
  const json = isJson ? JSON.parse(rawContent) : null

  let result: any

  if (rendered.startsWith('$.')) {
    if (isJson) {
      result = selectByJSONPath(json, rendered)
    } else {
      const parsed = parseSelector(rendered)
      result = select(rawContent, parsed.steps)
    }
  } else if (rendered.startsWith('//')) {
    result = selectByXPath(rawContent, rendered)
  } else if (isJson) {
    if (/^(class\.|id\.|tag\.)|@/.test(rendered)) {
      const parsed = parseSelector(rendered)
      result = parsed.steps.length > 0 ? select(rawContent, parsed.steps) : rendered
    } else {
      try {
        const jsExpr = rendered.replace(/^([a-zA-Z_]\w*)/, 'result.$1')
        const fn = new Function('result', `try { return (${jsExpr}) } catch(e) { return null }`)
        const evaled = fn(json)
        result = evaled !== null && evaled !== undefined ? evaled : rendered
      } catch {
        result = rendered
      }
    }
  } else {
    const parsed = parseSelector(rendered)
    if (parsed.steps.length > 0) {
      result = select(rawContent, parsed.steps)
    } else {
      result = rendered
    }
  }

  const originalParsed = parseSelector(ruleExpression)
  if (result && originalParsed.regexPattern) {
    const processItem = (item: string) => applyRegex(item, originalParsed.regexPattern!, originalParsed.regexReplacement || '')
    if (Array.isArray(result)) {
      result = result.map(processItem)
    } else {
      result = processItem(String(result))
    }
  }

  return result
}

export async function extractField(item: any, rule: string, ctx: EngineContext): Promise<string> {
  const content = typeof item === 'string' ? item : JSON.stringify(item)
  const result = await executeRule(content, rule, ctx)
  return Array.isArray(result) ? String(result[0] ?? '') : String(result ?? '')
}

export async function parseBookInfo(
  html: string,
  source: BookSource,
  ctx: EngineContext
): Promise<Partial<Book>> {
  const rules = source.ruleBookInfo
  const book: Record<string, any> = {}

  if (rules.init) {
    const initResult = await executeRule(html, rules.init, ctx)
    ctx.result = initResult
  }

  const fields = ['name', 'author', 'coverUrl', 'intro', 'kind', 'lastChapter', 'wordCount', 'tocUrl']
  for (const field of fields) {
    if (rules[field]) {
      try {
        const result = await executeRule(html, rules[field], ctx)
        book[field] = Array.isArray(result) ? result[0] : result
      } catch {
        book[field] = ''
      }
    }
  }
  return book as Partial<Book>
}

export async function parseSearchResults(
  html: string,
  source: BookSource,
  ctx: EngineContext
): Promise<Partial<Book>[]> {
  const rules = source.ruleSearch
  const listResult = await executeRule(html, rules.bookList || '', ctx)
  const items = Array.isArray(listResult) ? listResult : [listResult]

  const books: Partial<Book>[] = []
  const fields = ['name', 'author', 'coverUrl', 'intro', 'kind', 'lastChapter', 'wordCount', 'bookUrl']

  for (const item of items) {
    const itemCtx = { ...ctx, result: item }
    const book: Record<string, any> = {}
    for (const field of fields) {
      if (rules[field]) {
        try {
          const result = await executeRule(
            typeof item === 'string' ? html : JSON.stringify(item),
            rules[field],
            itemCtx
          )
          book[field] = Array.isArray(result) ? result[0] : result
        } catch {
          book[field] = ''
        }
      }
    }
    books.push(book as Partial<Book>)
  }
  return books
}

export async function parseToc(
  html: string,
  source: BookSource,
  ctx: EngineContext
): Promise<Chapter[]> {
  const rules = source.ruleToc
  const listResult = await executeRule(html, rules.chapterList || '', ctx)
  const rawItems = Array.isArray(listResult) ? listResult : [listResult]
  const items = rawItems.filter((i: any) => i != null && i !== '')

  return Promise.all(items.map(async (item: any, index: number) => {
    const itemCtx = { ...ctx, result: item }
    const bookId = ctx.book.id || ''
    return {
      id: `${bookId}::${source.bookSourceUrl}::${index}`,
      bookId,
      sourceUrl: source.bookSourceUrl,
      index,
      title: await extractField(item, rules.chapterName || '', itemCtx),
      url: await extractField(item, rules.chapterUrl || '', itemCtx),
      isVip: rules.isVip ? await extractField(item, rules.isVip, itemCtx) === 'true' : undefined,
      updateTime: rules.updateTime ? await extractField(item, rules.updateTime, itemCtx) : undefined,
    } as Chapter
  }))
}

export async function parseContent(
  html: string,
  source: BookSource,
  ctx: EngineContext
): Promise<{ content: string; nextUrl?: string }> {
  const rules = source.ruleContent
  const content = await executeRule(html, rules.content || '', ctx)

  let nextUrl: string | undefined
  if (rules.nextContentUrl) {
    nextUrl = await executeRule(html, rules.nextContentUrl, ctx)
    nextUrl = Array.isArray(nextUrl) ? nextUrl[0] : nextUrl
  }

  return {
    content: Array.isArray(content) ? content.join('\n') : String(content ?? ''),
    nextUrl,
  }
}
