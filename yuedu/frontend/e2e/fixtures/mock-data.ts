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
      bookList: 'class.result-item@html',
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
      chapterList: 'class.chapter-item@html',
      chapterName: 'class.chapter-title@text',
      chapterUrl: 'tag.a@href',
    },
    ruleContent: {
      content: 'class.content@html',
      nextContentUrl: '',
    },
    lastUpdateTime: Date.now(),
    respondTime: 100,
    enabledCookieJar: false,
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
  const seenUrls = new Set<string>()
  await page.route('**/api/proxy', async (route) => {
    const postData = route.request().postDataJSON()
    const url: string = postData?.url || ''

    if (!seenUrls.has(url)) {
      seenUrls.add(url)
      console.log(`[mock] proxying: ${url.substring(0, 80)}`)
    }

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
        body: JSON.stringify({ body: JSON.stringify(MOCK_BOOK_SOURCE_JSON), status: 200, headers: { 'content-type': 'application/json' } }),
      })
    } else {
      console.log(`[mock] UNMATCHED: ${url}`)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ body: '', status: 200, headers: {} }),
      })
    }
  })
}
