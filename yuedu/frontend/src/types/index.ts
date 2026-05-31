export type Rule = Record<string, string>

export interface BookSource {
  bookSourceUrl: string
  bookSourceName: string
  bookSourceGroup: string
  bookSourceType: number
  enabled: boolean
  customOrder: number
  weight: number
  header?: Record<string, string>
  loginUrl?: string
  loginUi?: string
  searchUrl?: string
  ruleSearch: Rule
  ruleBookInfo: Rule
  ruleToc: Rule
  ruleContent: Rule
  ruleExplore?: Rule
  exploreUrl?: string
  lastUpdateTime: number
  respondTime: number
  enabledCookieJar?: boolean
}

export interface BookSourceRef {
  sourceUrl: string
  bookId: string
  coverUrl?: string
  intro?: string
  kind?: string
  tocUrl?: string
}

export interface Book {
  id: string
  name: string
  author: string
  sources: BookSourceRef[]
  activeSourceUrl: string
  coverUrl?: string
  intro?: string
  kind?: string
  lastChapter?: string
  wordCount?: string
  tocUrl?: string
  createdAt: number
  updatedAt: number
}

export interface Chapter {
  id: string
  bookId: string
  sourceUrl: string
  index: number
  title: string
  url: string
  isVip?: boolean
  updateTime?: string
}

export interface ReadingProgress {
  id: string
  bookId: string
  sourceUrl: string
  chapterIndex: number
  scrollPosition: number
  updatedAt: number
}

export type SelectorType = 'class' | 'id' | 'tag' | 'attribute'

export interface SelectorStep {
  type: SelectorType
  value: string
  index: number | null
  exclude: number | null
  attribute: string | null
}

export interface ParsedSelector {
  steps: SelectorStep[]
  regexPattern?: string
  regexReplacement?: string
}

export interface JavaMock {
  getElement: (path: string) => any[]
  toast: (msg: string) => void
  longToast: (msg: string) => void
  ajax: (url: string) => string
  get: (key: string) => any
  put: (key: string, value: any) => void
  base64Encode: (data: string) => string
  hexDecodeToString: (data: string) => string
  startBrowserAwait: (url: string, msg: string) => void
  setContent: (content: string) => void
  timeFormat: (timestamp: number) => string
  androidId: () => string | null
}

export interface EngineContext {
  key: string
  page: number
  book: Record<string, any>
  source: BookSource
  result: any
  baseUrl: string
  java: JavaMock
}
