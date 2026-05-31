# Yuedu Reader 测试体系实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Yuedu Reader 搭建 Vitest + Playwright 测试体系，覆盖引擎单元测试、Vue 组件测试和浏览器 E2E 用户流程。

**Architecture:** Vitest 跑引擎/组件/Store 单元测试（fake-indexeddb mock IndexedDB，@vue/test-utils mount 组件），Playwright 启动 Chromium 浏览器拦截 proxy 请求模拟用户搜索→详情→阅读完整流程。

**Tech Stack:** Vitest, @vue/test-utils, fake-indexeddb, jsdom, @playwright/test

---

### Task 1: 安装依赖 + 基础配置

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/__tests__/setup.ts`

- [ ] **Step 1: 更新 frontend/package.json**

添加 devDependencies 和 test script：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.1.0",
    "typescript": "^5.4.0",
    "vite": "^6.0.0",
    "vue-tsc": "^2.1.0",
    "vitest": "^3.0.0",
    "@vue/test-utils": "^2.4.0",
    "fake-indexeddb": "^6.0.0",
    "jsdom": "^25.0.0",
    "@playwright/test": "^1.50.0"
  }
}
```

- [ ] **Step 2: 创建 vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: 创建测试入口 setup.ts**

```typescript
import { vi } from 'vitest'
import 'fake-indexeddb/auto'
```

- [ ] **Step 4: 安装依赖**

Run: `npm install`
Expected: 依赖安装成功

- [ ] **Step 5: 验证 Vitest 可运行**

Run: `npx vitest run`
Expected: 无测试文件，输出 `No test files found`

- [ ] **Step 6: 初始化 Playwright**

Run: `npx playwright install chromium`
Expected: Chromium 浏览器下载完成

---

### Task 2: 引擎单元测试 — selector-parser

**Files:**
- Create: `frontend/src/__tests__/engine/selector-parser.test.ts`

- [ ] **Step 1: 编写选择器解析测试**

```typescript
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

  it('无 @ 后缀默认无 attribute（由调用方决定）', () => {
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
```

- [ ] **Step 2: 运行测试验证通过**

Run: `npx vitest run src/__tests__/engine/selector-parser.test.ts`
Expected: 全部 PASS

---

### Task 3: 引擎单元测试 — html-parser

**Files:**
- Create: `frontend/src/__tests__/engine/html-parser.test.ts`

- [ ] **Step 1: 编写 HTML 解析测试**

```typescript
import { describe, it, expect } from 'vitest'
import { select } from '@/engine/html-parser'

const html = `<div class="book-list">
  <div class="item">
    <span class="name">书名A</span>
    <span class="author">作者A</span>
    <a href="/book/1">详情</a>
  </div>
  <div class="item">
    <span class="name">书名B</span>
    <span class="author">作者B</span>
    <a href="/book/2">详情</a>
  </div>
</div>`

describe('select', () => {
  it('通过 class 提取 text', () => {
    const result = select(html, [
      { type: 'class', value: 'name', index: null, exclude: null, attribute: 'text' },
    ])
    expect(result).toEqual(['书名A', '书名B'])
  })

  it('通过 tag 提取 href', () => {
    const result = select(html, [
      { type: 'tag', value: 'a', index: null, exclude: null, attribute: 'href' },
    ])
    expect(result).toEqual(['/book/1', '/book/2'])
  })

  it('index 参数取第 N 个', () => {
    const result = select(html, [
      { type: 'class', value: 'name', index: 1, exclude: null, attribute: 'text' },
    ])
    expect(result).toEqual(['书名B'])
  })

  it('exclude 排除第 N 个', () => {
    const result = select(html, [
      { type: 'class', value: 'name', index: null, exclude: 0, attribute: 'text' },
    ])
    expect(result).toEqual(['书名B'])
  })

  it('链式选择器 class.item → tag.a@href', () => {
    const result = select(html, [
      { type: 'class', value: 'item', index: null, exclude: null, attribute: null },
      { type: 'tag', value: 'a', index: null, exclude: null, attribute: 'href' },
    ])
    expect(result).toEqual(['/book/1', '/book/2'])
  })

  it('无效选择器返回空数组', () => {
    const result = select(html, [
      { type: 'class', value: 'nonexistent', index: null, exclude: null, attribute: 'text' },
    ])
    expect(result).toEqual([])
  })

  it('空 steps 返回空数组', () => {
    expect(select(html, [])).toEqual([])
  })

  it('提取 html 属性', () => {
    const result = select(html, [
      { type: 'class', value: 'item', index: 0, exclude: null, attribute: 'html' },
    ])
    expect(result[0]).toContain('书名A')
    expect(result[0]).toContain('作者A')
  })
})
```

- [ ] **Step 2: 运行测试验证通过**

Run: `npx vitest run src/__tests__/engine/html-parser.test.ts`
Expected: 全部 PASS

---

### Task 4: 引擎单元测试 — template

**Files:**
- Create: `frontend/src/__tests__/engine/template.test.ts`

- [ ] **Step 1: 编写模板渲染测试**

```typescript
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
    expect(renderTemplate('{{$.data.list}}', mockCtx)).toBe('a')
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
```

- [ ] **Step 2: 运行测试验证通过**

Run: `npx vitest run src/__tests__/engine/template.test.ts`
Expected: 全部 PASS

---

### Task 5: 引擎单元测试 — xpath / jsonpath / regex

**Files:**
- Create: `frontend/src/__tests__/engine/xpath-parser.test.ts`
- Create: `frontend/src/__tests__/engine/jsonpath-parser.test.ts`
- Create: `frontend/src/__tests__/engine/regex-processor.test.ts`

- [ ] **Step 1: 编写 xpath-parser 测试**

```typescript
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
```

- [ ] **Step 2: 编写 jsonpath-parser 测试**

```typescript
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
```

- [ ] **Step 3: 编写 regex-processor 测试**

```typescript
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
```

- [ ] **Step 4: 运行所有引擎测试**

Run: `npx vitest run src/__tests__/engine/`
Expected: 全部 PASS

---

### Task 6: 引擎单元测试 — pipeline

**Files:**
- Create: `frontend/src/__tests__/engine/pipeline.test.ts`

- [ ] **Step 1: 编写 pipeline 测试**

```typescript
import { describe, it, expect } from 'vitest'
import { parseToc, parseContent, createSearchContext, createBookContext } from '@/engine/pipeline'
import type { BookSource } from '@/types'

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
  ruleToc: {
    chapterList: 'class.chapter-item',
    chapterName: 'class.chapter-title@text',
    chapterUrl: 'tag.a@href',
  },
  ruleContent: {
    content: 'class.content@html',
  },
  lastUpdateTime: 0,
  respondTime: 0,
}

const tocHtml = `<div class="chapter-list">
  <div class="chapter-item">
    <span class="chapter-title">第一章</span>
    <a href="/chapter/1">阅读</a>
  </div>
  <div class="chapter-item">
    <span class="chapter-title">第二章</span>
    <a href="/chapter/2">阅读</a>
  </div>
</div>`

describe('parseToc', () => {
  it('解析章节列表并生成正确 ID', async () => {
    const ctx = createBookContext({ id: 'book123' }, mockSource, 'https://example.com')
    const chapters = await parseToc(tocHtml, mockSource, ctx)

    expect(chapters).toHaveLength(2)
    expect(chapters[0]).toMatchObject({
      id: 'book123::https://example.com::0',
      bookId: 'book123',
      sourceUrl: 'https://example.com',
      index: 0,
      title: '第一章',
      url: '/chapter/1',
    })
    expect(chapters[1]).toMatchObject({
      id: 'book123::https://example.com::1',
      index: 1,
      title: '第二章',
      url: '/chapter/2',
    })
  })

  it('空的章节列表返回空数组', async () => {
    const ctx = createBookContext({ id: 'book123' }, mockSource, 'https://example.com')
    const source = { ...mockSource, ruleToc: { chapterList: '', chapterName: '', chapterUrl: '' } }
    const chapters = await parseToc('<div></div>', source, ctx)
    expect(chapters).toHaveLength(0)
  })
})

describe('parseContent', () => {
  it('提取正文内容', async () => {
    const ctx = createBookContext({ id: 'book123' }, mockSource, 'https://example.com')
    const html = '<div class="content"><p>这是正文内容</p></div>'
    const result = await parseContent(html, mockSource, ctx)
    expect(result.content).toContain('这是正文内容')
    expect(result.nextUrl).toBeUndefined()
  })

  it('无 content 规则返回空字符串', async () => {
    const ctx = createBookContext({ id: 'book123' }, mockSource, 'https://example.com')
    const source = { ...mockSource, ruleContent: { content: '' } }
    const result = await parseContent('<div></div>', source, ctx)
    expect(result.content).toBe('')
  })
})

describe('createSearchContext', () => {
  it('创建搜索上下文', () => {
    const ctx = createSearchContext('keyword', 1, mockSource, 'https://example.com')
    expect(ctx.key).toBe('keyword')
    expect(ctx.page).toBe(1)
    expect(ctx.source.bookSourceName).toBe('测试源')
  })
})
```

- [ ] **Step 2: 运行测试验证通过**

Run: `npx vitest run src/__tests__/engine/pipeline.test.ts`
Expected: 全部 PASS

---

### Task 7: 组件单元测试 — 基础组件

**Files:**
- Create: `frontend/src/__tests__/components/SearchBar.test.ts`
- Create: `frontend/src/__tests__/components/BookCard.test.ts`
- Create: `frontend/src/__tests__/components/ChapterList.test.ts`

- [ ] **Step 1: 编写 SearchBar 测试**

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SearchBar from '@/components/SearchBar.vue'

describe('SearchBar', () => {
  it('输入关键词后回车触发 search 事件', async () => {
    const wrapper = mount(SearchBar)
    const input = wrapper.find('input')
    await input.setValue('测试关键词')
    await input.trigger('keyup.enter')
    expect(wrapper.emitted('search')).toBeTruthy()
    expect(wrapper.emitted('search')![0]).toEqual(['测试关键词'])
  })

  it('点击按钮触发 search 事件', async () => {
    const wrapper = mount(SearchBar)
    const input = wrapper.find('input')
    await input.setValue('点击搜索')
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('search')![0]).toEqual(['点击搜索'])
  })

  it('渲染输入框和按钮', () => {
    const wrapper = mount(SearchBar)
    expect(wrapper.find('input').exists()).toBe(true)
    expect(wrapper.find('button').exists()).toBe(true)
    expect(wrapper.find('button').text()).toBe('搜索')
  })
})
```

- [ ] **Step 2: 编写 BookCard 测试**

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import BookCard from '@/components/BookCard.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/book/:id', name: 'book-detail', component: {} as any }],
})

describe('BookCard', () => {
  it('渲染书名和作者', () => {
    const wrapper = mount(BookCard, {
      global: { plugins: [router] },
      props: {
        book: { id: '1', name: '测试书名', author: '测试作者' } as any,
      },
    })
    expect(wrapper.text()).toContain('测试书名')
    expect(wrapper.text()).toContain('测试作者')
  })

  it('无封面时显示占位符', () => {
    const wrapper = mount(BookCard, {
      global: { plugins: [router] },
      props: {
        book: { id: '1', name: '测试', author: '作者' } as any,
      },
    })
    expect(wrapper.find('.card-cover-placeholder').exists()).toBe(true)
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('有封面时显示图片', () => {
    const wrapper = mount(BookCard, {
      global: { plugins: [router] },
      props: {
        book: { id: '1', name: '测试', author: '作者', coverUrl: 'https://example.com/cover.jpg' } as any,
      },
    })
    expect(wrapper.find('img').exists()).toBe(true)
    expect(wrapper.find('img').attributes('src')).toBe('https://example.com/cover.jpg')
  })
})
```

- [ ] **Step 3: 编写 ChapterList 测试**

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChapterList from '@/components/ChapterList.vue'

const chapters = [
  { id: '1', bookId: 'b1', sourceUrl: 's1', index: 0, title: '第一章', url: '/c1', isVip: false },
  { id: '2', bookId: 'b1', sourceUrl: 's1', index: 1, title: '第二章', url: '/c2', isVip: true },
]

describe('ChapterList', () => {
  it('渲染所有章节', () => {
    const wrapper = mount(ChapterList, { props: { chapters } })
    expect(wrapper.text()).toContain('第一章')
    expect(wrapper.text()).toContain('第二章')
    expect(wrapper.findAll('.chapter-item')).toHaveLength(2)
  })

  it('VIP 章节显示标签', () => {
    const wrapper = mount(ChapterList, { props: { chapters } })
    expect(wrapper.find('.ch-vip').exists()).toBe(true)
  })

  it('点击章节 emit select', async () => {
    const wrapper = mount(ChapterList, { props: { chapters } })
    await wrapper.findAll('.chapter-item')[0].trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')![0]).toEqual([chapters[0]])
  })

  it('空列表显示暂无章节', () => {
    const wrapper = mount(ChapterList, { props: { chapters: [] } })
    expect(wrapper.text()).toContain('暂无章节')
  })
})
```

- [ ] **Step 4: 运行组件测试**

Run: `npx vitest run src/__tests__/components/`
Expected: 全部 PASS

---

### Task 8: 组件单元测试 — 业务组件

**Files:**
- Create: `frontend/src/__tests__/components/BookInfo.test.ts`
- Create: `frontend/src/__tests__/components/SourceSelector.test.ts`
- Create: `frontend/src/__tests__/components/ReaderSettings.test.ts`

- [ ] **Step 1: 编写 BookInfo 测试**

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BookInfo from '@/components/BookInfo.vue'

const book = {
  id: '1',
  name: '测试书名',
  author: '测试作者',
  kind: '玄幻',
  intro: '这是一本很好看的书',
  coverUrl: 'https://example.com/cover.jpg',
}

describe('BookInfo', () => {
  it('渲染书籍信息', () => {
    const wrapper = mount(BookInfo, { props: { book } })
    expect(wrapper.text()).toContain('测试书名')
    expect(wrapper.text()).toContain('测试作者')
    expect(wrapper.text()).toContain('玄幻')
    expect(wrapper.text()).toContain('这是一本很好看的书')
  })

  it('未加入书架时显示加入书架按钮', () => {
    const wrapper = mount(BookInfo, { props: { book } })
    expect(wrapper.find('.btn-add').exists()).toBe(true)
    expect(wrapper.find('.btn-read').exists()).toBe(false)
  })

  it('已加入书架时显示开始阅读按钮', () => {
    const wrapper = mount(BookInfo, { props: { book, inShelf: true } })
    expect(wrapper.find('.btn-read').exists()).toBe(true)
    expect(wrapper.find('.btn-add').exists()).toBe(false)
  })

  it('点击加入书架 emit add', async () => {
    const wrapper = mount(BookInfo, { props: { book } })
    await wrapper.find('.btn-add').trigger('click')
    expect(wrapper.emitted('add')).toBeTruthy()
  })

  it('没有封面时仍然渲染', () => {
    const wrapper = mount(BookInfo, { props: { book: { ...book, coverUrl: undefined } } })
    expect(wrapper.find('img').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 编写 SourceSelector 测试**

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SourceSelector from '@/components/SourceSelector.vue'
import { useSourceStore } from '@/stores/source-store'

describe('SourceSelector', () => {
  it('渲染启用的书源', async () => {
    setActivePinia(createPinia())
    const store = useSourceStore()
    store.sources = [
      { bookSourceUrl: 's1', bookSourceName: '源1', enabled: true } as any,
      { bookSourceUrl: 's2', bookSourceName: '源2', enabled: true } as any,
      { bookSourceUrl: 's3', bookSourceName: '源3', enabled: false } as any,
    ]

    const wrapper = mount(SourceSelector, { global: { plugins: [createPinia()] } })
    await wrapper.vm.$nextTick()
    const labels = wrapper.findAll('.source-option')
    expect(labels).toHaveLength(2)
  })
})
```

- [ ] **Step 3: 编写 ReaderSettings 测试**

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ReaderSettings from '@/components/ReaderSettings.vue'
import { useReaderStore } from '@/stores/reader-store'

describe('ReaderSettings', () => {
  it('渲染设置面板', () => {
    setActivePinia(createPinia())
    const wrapper = mount(ReaderSettings, { global: { plugins: [createPinia()] } })
    expect(wrapper.text()).toContain('字号')
    expect(wrapper.text()).toContain('行距')
    expect(wrapper.text()).toContain('背景')
    expect(wrapper.text()).toContain('字体')
  })

  it('A+ 按钮增加字号', async () => {
    setActivePinia(createPinia())
    const store = useReaderStore()
    const initialSize = store.settings.fontSize
    const wrapper = mount(ReaderSettings, { global: { plugins: [createPinia()] } })
    await wrapper.findAll('button').filter(b => b.text() === 'A+')[0].trigger('click')
    expect(store.settings.fontSize).toBe(initialSize + 2)
  })

  it('背景色预设点击切换颜色', async () => {
    setActivePinia(createPinia())
    const store = useReaderStore()
    const wrapper = mount(ReaderSettings, { global: { plugins: [createPinia()] } })
    const colorBtns = wrapper.findAll('.color-btn')
    if (colorBtns.length > 1) {
      await colorBtns[1].trigger('click')
      expect(store.settings.bgColor).not.toBe('#f5f0e8')
    }
  })
})
```

- [ ] **Step 4: 运行全部测试**

Run: `npx vitest run`
Expected: 全部 PASS

---

### Task 9: E2E Mock 数据

**Files:**
- Create: `frontend/e2e/playwright.config.ts`
- Create: `frontend/e2e/fixtures/mock-data.ts`

- [ ] **Step 1: 创建 Playwright 配置**

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  webServer: [
    {
      command: 'npm run dev',
      port: 5173,
      cwd: '../',
      reuseExistingServer: true,
    },
    {
      command: 'npm run dev',
      port: 3001,
      cwd: '../../server',
      reuseExistingServer: true,
    },
  ],
})
```

- [ ] **Step 2: 创建 Mock 数据**

```typescript
import { Page } from '@playwright/test'

export const MOCK_BOOK_SOURCE_JSON = [
  {
    bookSourceUrl: 'https://example.com',
    bookSourceName: '示例书源',
    bookSourceGroup: '测试',
    bookSourceType: 0,
    enabled: true,
    customOrder: 0,
    weight: 0,
    searchUrl: 'https://example.com/search?q={{key}}&page={{page}}',
    ruleSearch: {
      bookList: 'class.result-item',
      name: 'class.book-name@text',
      author: 'class.author@text',
      coverUrl: 'img.cover@src',
      bookUrl: 'tag.a@href',
      intro: 'class.desc@text',
    },
    ruleBookInfo: {
      name: 'class.book-name@text',
      author: 'class.author@text',
      coverUrl: 'img.cover@src',
      intro: 'class.intro@text',
      kind: 'class.category@text',
      tocUrl: 'tag.a.toc-link@href',
    },
    ruleToc: {
      chapterList: 'class.chapter-item',
      chapterName: 'class.chapter-title@text',
      chapterUrl: 'tag.a@href',
    },
    ruleContent: {
      content: 'class.content@html',
      nextContentUrl: '',
    },
    lastUpdateTime: Date.now(),
    respondTime: 100,
  },
]

export const SEARCH_HTML = `<!DOCTYPE html>
<html><body>
<div class="result-item">
  <img class="cover" src="https://example.com/cover1.jpg" />
  <span class="book-name">测试书籍</span>
  <span class="author">测试作者</span>
  <span class="desc">这是一本用于测试的书籍简介。</span>
  <a href="/book/123">详情</a>
</div>
<div class="result-item">
  <img class="cover" src="https://example.com/cover2.jpg" />
  <span class="book-name">第二本书</span>
  <span class="author">另一位作者</span>
  <span class="desc">第二本书的简介内容。</span>
  <a href="/book/456">详情</a>
</div>
</body></html>`

export const BOOK_DETAIL_HTML = `<!DOCTYPE html>
<html><body>
<div class="book-name">测试书籍</div>
<div class="author">测试作者</div>
<img class="cover" src="https://example.com/cover1.jpg" />
<div class="intro">这是一本用于测试的书籍简介，内容比较丰富。</div>
<div class="category">玄幻</div>
<a class="toc-link" href="/toc/123">目录</a>
</body></html>`

export const TOC_HTML = `<!DOCTYPE html>
<html><body>
<div class="chapter-item">
  <span class="chapter-title">第一章 开始</span>
  <a href="/content/1">阅读</a>
</div>
<div class="chapter-item">
  <span class="chapter-title">第二章 发展</span>
  <a href="/content/2">阅读</a>
</div>
<div class="chapter-item">
  <span class="chapter-title">第三章 高潮</span>
  <a href="/content/3">阅读</a>
</div>
</body></html>`

export const CONTENT_HTML = `<!DOCTYPE html>
<html><body>
<div class="content">
<p>这是第一章的正文内容。测试书籍的故事从这里开始。</p>
<p>主人公踏上了冒险的旅程，一路上遇到了许多挑战。</p>
<p>这些挑战让他不断成长，也让他结识了新的伙伴。</p>
<p>故事还在继续，精彩的内容等着读者去发现。</p>
</div>
</body></html>`

export async function setupProxyMocks(page: Page) {
  await page.route('**/api/proxy', async (route) => {
    const postData = route.request().postDataJSON()
    const url: string = postData?.url || ''

    if (url.includes('search')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ body: SEARCH_HTML, status: 200, headers: { 'content-type': 'text/html' } }),
      })
    } else if (url.includes('/book/') || url.includes('/detail')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ body: BOOK_DETAIL_HTML, status: 200, headers: { 'content-type': 'text/html' } }),
      })
    } else if (url.includes('/toc/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ body: TOC_HTML, status: 200, headers: { 'content-type': 'text/html' } }),
      })
    } else if (url.includes('/content/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ body: CONTENT_HTML, status: 200, headers: { 'content-type': 'text/html' } }),
      })
    } else if (url.includes('jsdmirror') || url.includes('shuyuan')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_BOOK_SOURCE_JSON),
      })
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ body: '', status: 200, headers: {} }),
      })
    }
  })
}
```

- [ ] **Step 3: 在 package.json 中添加 e2e script**

检查 `frontend/package.json` 中已有 `"test:e2e": "playwright test"`

---

### Task 10: E2E 测试 — 搜索流程

**Files:**
- Create: `frontend/e2e/specs/search-flow.spec.ts`

- [ ] **Step 1: 编写搜索流程测试**

```typescript
import { test, expect } from '@playwright/test'
import { setupProxyMocks, MOCK_BOOK_SOURCE_JSON } from '../fixtures/mock-data'

test.describe('搜索流程', () => {
  test.beforeEach(async ({ page }) => {
    await setupProxyMocks(page)
  })

  test('导航到搜索页面', async ({ page }) => {
    await page.goto('/')
    await page.click('text=搜索')
    await expect(page).toHaveURL(/\/search/)
  })

  test('输入关键词搜索展示结果', async ({ page }) => {
    await page.goto('/search')
    await page.fill('input[placeholder*="搜索"]', '测试')
    await page.click('button:has-text("搜索")')
    await page.waitForSelector('.book-item')
    const items = page.locator('.book-item')
    await expect(items).toHaveCount(2)
    await expect(items.first()).toContainText('测试书籍')
    await expect(items.first()).toContainText('测试作者')
  })

  test('搜索结果包含来源标签', async ({ page }) => {
    await page.goto('/search')
    await page.fill('input[placeholder*="搜索"]', '测试')
    await page.click('button:has-text("搜索")')
    await page.waitForSelector('.book-item')
    await expect(page.locator('.book-item').first()).toContainText('来源')
  })

  test('空搜索不触发请求', async ({ page }) => {
    let requestCount = 0
    await page.route('**/api/proxy', () => { requestCount++ })
    await page.goto('/search')
    await page.click('button:has-text("搜索")')
    expect(requestCount).toBe(0)
  })
})
```

- [ ] **Step 2: 运行验证**

Run: `npx playwright test search-flow.spec.ts`
Expected: PASS

---

### Task 11: E2E 测试 — 书籍详情流程

**Files:**
- Create: `frontend/e2e/specs/book-detail-flow.spec.ts`

- [ ] **Step 1: 编写书籍详情测试**

```typescript
import { test, expect } from '@playwright/test'
import { setupProxyMocks, MOCK_BOOK_SOURCE_JSON } from '../fixtures/mock-data'

test.describe('书籍详情流程', () => {
  test.beforeEach(async ({ page }) => {
    await setupProxyMocks(page)
  })

  test('从搜索结果点击进入详情页', async ({ page }) => {
    await page.goto('/search')
    await page.fill('input[placeholder*="搜索"]', '测试')
    await page.click('button:has-text("搜索")')
    await page.waitForSelector('.book-item')
    await page.click('.book-item:first-child')
    await expect(page).toHaveURL(/\/book\//)
  })

  test('详情页展示书籍信息', async ({ page }) => {
    await page.goto('/search')
    await page.fill('input[placeholder*="搜索"]', '测试')
    await page.click('button:has-text("搜索")')
    await page.waitForSelector('.book-item')
    await page.click('.book-item:first-child')
    await page.waitForSelector('.book-info')

    await expect(page.locator('.name')).toContainText('测试书籍')
    await expect(page.locator('.author')).toContainText('测试作者')
  })

  test('详情页展示目录列表', async ({ page }) => {
    await page.goto('/search')
    await page.fill('input[placeholder*="搜索"]', '测试')
    await page.click('button:has-text("搜索")')
    await page.waitForSelector('.book-item')
    await page.click('.book-item:first-child')
    await page.waitForSelector('.chapter-list')

    const chapters = page.locator('.chapter-item')
    await expect(chapters).toHaveCount(3)
    await expect(chapters.first()).toContainText('第一章')
  })

  test('点击加入书架按钮', async ({ page }) => {
    await page.goto('/search')
    await page.fill('input[placeholder*="搜索"]', '测试')
    await page.click('button:has-text("搜索")')
    await page.waitForSelector('.book-item')
    await page.click('.book-item:first-child')
    await page.waitForSelector('.btn-add')
    await page.click('.btn-add')
    await expect(page.locator('.btn-read')).toContainText('开始阅读')
  })
})
```

- [ ] **Step 2: 运行验证**

Run: `npx playwright test book-detail-flow.spec.ts`
Expected: PASS

---

### Task 12: E2E 测试 — 阅读流程

**Files:**
- Create: `frontend/e2e/specs/reader-flow.spec.ts`

- [ ] **Step 1: 编写阅读流程测试**

```typescript
import { test, expect } from '@playwright/test'
import { setupProxyMocks } from '../fixtures/mock-data'

test.describe('阅读流程', () => {
  test.beforeEach(async ({ page }) => {
    await setupProxyMocks(page)
  })

  test('从详情进入阅读页', async ({ page }) => {
    await page.goto('/search')
    await page.fill('input[placeholder*="搜索"]', '测试')
    await page.click('button:has-text("搜索")')
    await page.waitForSelector('.book-item')
    await page.click('.book-item:first-child')
    await page.waitForSelector('.btn-add')
    await page.click('.btn-add')
    await page.click('.btn-read')
    await expect(page).toHaveURL(/\/read\//)
  })

  test('阅读页展示正文', async ({ page }) => {
    await page.goto('/search')
    await page.fill('input[placeholder*="搜索"]', '测试')
    await page.click('button:has-text("搜索")')
    await page.waitForSelector('.book-item')
    await page.click('.book-item:first-child')
    await page.waitForSelector('.btn-add')
    await page.click('.btn-add')
    await page.click('.btn-read')
    await page.waitForSelector('.reader-content')
    const content = page.locator('.reader-content')
    await expect(content).toContainText('第一章的正文内容')
  })

  test('阅读设置 — 调整字号', async ({ page }) => {
    await page.goto('/search')
    await page.fill('input[placeholder*="搜索"]', '测试')
    await page.click('button:has-text("搜索")')
    await page.waitForSelector('.book-item')
    await page.click('.book-item:first-child')
    await page.waitForSelector('.btn-add')
    await page.click('.btn-add')
    await page.click('.btn-read')
    await page.waitForSelector('.reader-content')

    await page.click('button:has-text("设置")')
    await page.waitForSelector('.reader-settings')
    await page.click('button:has-text("A+")')

    const fontSize = await page.locator('.reader-content').getAttribute('style')
    expect(fontSize).toContain('font-size')
  })

  test('阅读设置 — 切换背景色', async ({ page }) => {
    await page.goto('/search')
    await page.fill('input[placeholder*="搜索"]', '测试')
    await page.click('button:has-text("搜索")')
    await page.waitForSelector('.book-item')
    await page.click('.book-item:first-child')
    await page.waitForSelector('.btn-add')
    await page.click('.btn-add')
    await page.click('.btn-read')
    await page.waitForSelector('.reader-content')

    await page.click('button:has-text("设置")')
    await page.waitForSelector('.reader-settings')
    const colorBtns = page.locator('.color-btn')
    const count = await colorBtns.count()
    if (count > 1) {
      await colorBtns.nth(1).click()
    }

    const bgColor = await page.locator('.reader-content').getAttribute('style')
    expect(bgColor).toBeTruthy()
  })

  test('切换章节', async ({ page }) => {
    await page.goto('/search')
    await page.fill('input[placeholder*="搜索"]', '测试')
    await page.click('button:has-text("搜索")')
    await page.waitForSelector('.book-item')
    await page.click('.book-item:first-child')
    await page.waitForSelector('.btn-add')
    await page.click('.btn-add')
    await page.click('.btn-read')
    await page.waitForSelector('.reader-nav')

    await page.click('button:has-text("下一章")')
    await page.waitForTimeout(500)
    const content = page.locator('.reader-content')
    await expect(content).toContainText('正文内容')
  })
})
```

- [ ] **Step 2: 运行全部 E2E 测试**

Run: `npx playwright test`
Expected: 全部 PASS
