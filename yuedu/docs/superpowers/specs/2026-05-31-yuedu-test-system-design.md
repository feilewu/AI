# Yuedu Reader 测试体系设计

## 概述

为 Yuedu Reader 搭建完整测试体系：Vitest 做单元/组件/集成测试，Playwright 做浏览器端到端测试，覆盖引擎、Store、组件和用户流程。

## 技术选型

| 层 | 工具 | 用途 |
|---|------|------|
| 测试框架 | Vitest | 单元/集成/组件测试 |
| Vue 组件测试 | `@vue/test-utils` | 组件渲染与交互 |
| IndexedDB Mock | `fake-indexeddb` | DB 层测试 |
| E2E 测试 | Playwright | 浏览器用户流程 |

## 目录结构

```
frontend/
├── vitest.config.ts
├── src/
│   └── __tests__/
│       ├── engine/
│       │   ├── selector-parser.test.ts
│       │   ├── html-parser.test.ts
│       │   ├── xpath-parser.test.ts
│       │   ├── jsonpath-parser.test.ts
│       │   ├── template.test.ts
│       │   ├── regex-processor.test.ts
│       │   └── pipeline.test.ts
│       ├── stores/
│       │   └── source-store.test.ts
│       └── components/
│           ├── SearchBar.test.ts
│           ├── BookCard.test.ts
│           ├── BookInfo.test.ts
│           ├── ChapterList.test.ts
│           ├── SourceSelector.test.ts
│           └── ReaderSettings.test.ts
└── e2e/
    ├── playwright.config.ts
    ├── fixtures/
    │   ├── mock-data.ts
    │   ├── book-source.json
    │   ├── search-results.html
    │   ├── book-detail.html
    │   ├── toc.html
    │   └── chapter-content.html
    └── specs/
        ├── search-flow.spec.ts
        ├── book-detail-flow.spec.ts
        └── reader-flow.spec.ts
```

## Mock 策略

### Vitest
- `fake-indexeddb` 模拟 Dexie 的 IndexedDB 后端
- 引擎测试直接调用纯函数，无需 DOM
- 组件测试用 `@vue/test-utils` mount，mock Pinia store

### Playwright
- `page.route('**/api/proxy*')` 拦截所有代理请求，返回本地固定 Mock 数据
- 不依赖外部网络和真实书源站点
- 使用 `localStorage` 注入阅读器设置

## Mock 数据

E2E 需要以下 mock 响应：

1. **BookSource JSON**: 模拟 CDN 上的书源列表（3-5 条，含 search/bookInfo/toc/content 规则）
2. **Search URL HTML**: 模拟搜索结果的 HTML 页面（包含书名、作者、封面链接）
3. **Book Detail HTML**: 模拟书籍详情页（含书名、作者、简介、封面）
4. **TOC HTML**: 模拟目录页（含 5-10 章标题和链接）
5. **Chapter Content HTML**: 模拟正文页（包含 500+ 字小说正文）

## 测试用例

### Engine 单元测试

**selector-parser.test.ts:**
- `class.book-name@text` → `{type:'class', value:'book-name', attribute:'text'}`
- `tag.a.0@href` → `{type:'tag', value:'a', index:0, attribute:'href'}`
- `class.a!0@tag.b@text` → 两步 steps，exclude 第一项
- `##pattern##replacement` 提取正则部分
- 空输入返回 `{steps:[]}`
- 无 @ 后缀默认 text

**html-parser.test.ts:**
- 从 HTML 中通过 class 提取 text
- 通过 tag 提取 href
- index 参数选取第 N 个匹配
- exclude 排除第 N 个匹配
- 无效选择器返回空数组

**template.test.ts:**
- `{{key}}` → keyword
- `{{page}}` → 页码字符串
- `{{book.name}}` → 书籍名称
- `{{source.bookSourceName}}` → 书源名称
- 无模板变量返回原字符串

**regex-processor.test.ts:**
- `##xxx##yyy` 替换
- 无匹配返回原字符串
- 无效正则返回原字符串

**pipeline.test.ts:**
- `executeRule` 返回原始文本
- `executeRule` JSONPath 分支 `$.data.list`
- `parseToc` 解析章节列表并生成正确 ID
- `parseContent` 提取正文

### 组件测试

**SearchBar.test.ts:**
- 输入关键词后 emit `search` 事件
- 按钮点击触发搜索
- 空输入不触发

**BookCard.test.ts:**
- 渲染书名/作者
- 有点击跳转到 `/book/:id`
- 有 cover 时显示图片，无 cover 时显示占位符

**ChapterList.test.ts:**
- 渲染章节列表
- 点击 emit `select` 事件
- VIP 标签渲染

**SourceSelector.test.ts:**
- 渲染启用的书源
- 选中状态默认全选

### E2E 测试

**search-flow.spec.ts:**
1. 浏览器导航到 `/`
2. 页面包含预设书源自动导入
3. 点击导航「搜索」链接
4. 输入关键词并触发搜索
5. 等待 mock 搜索结果渲染
6. 验证结果列表中包含书名和作者

**book-detail-flow.spec.ts:**
1. 从搜索结果点选第一本书
2. 验证 URL 变为 `/book/:id`
3. 验证书籍名称、作者、简介渲染
4. 验证目录列表渲染（5-10 章）
5. 点击「加入书架」
6. 按钮变为「开始阅读」

**reader-flow.spec.ts:**
1. 从详情页点击「开始阅读」
2. 验证 URL 变为 `/read/:bookId/0`
3. 验证正文内容渲染
4. 点击「设置」调整字号
5. 切换字体
6. 点击「下一章」
7. 验证章节切换和内容更新

## 依赖

```json
{
  "devDependencies": {
    "vitest": "^3.0.0",
    "@vue/test-utils": "^2.4.0",
    "fake-indexeddb": "^6.0.0",
    "@playwright/test": "^1.50.0",
    "jsdom": "^25.0.0"
  }
}
```
