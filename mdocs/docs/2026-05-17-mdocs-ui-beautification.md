# MDocs UI 美化设计方案

## 背景

MDocs 是一个 Markdown 文档展示 Web 服务，原始 UI 样式简陋（基础 inline CSS，无暗色模式，排版平淡）。用户希望对渲染效果进行美化，并支持左侧目录树折叠。

## 需求

1. Markdown 渲染页面整体美化（排版、代码块、表格、blockquote 等）
2. 支持系统暗色模式自动切换（`prefers-color-scheme`）
3. 左侧目录树可折叠/展开
4. 零额外依赖，轻量实现

## 设计方案

### 样式架构

- 所有样式从 `base.html` 的 inline `<style>` 迁移到独立文件 `static/style.css`
- 使用 CSS 自定义属性（variables）驱动主题，通过 `prefers-color-scheme: dark` 自动切换
- 颜色、间距、字体等全部通过变量定义，便于后续扩展

### 排版系统

| 元素 | 规格 |
|------|------|
| 基础字号 | 15px |
| 行高 | 1.6（正文 1.75） |
| h1 | 1.8rem / 800 weight |
| h2 | 1.35rem / 700 weight + 下边框 |
| h3 | 1.1rem / 600 weight |
| 代码块 | 13.5px / 圆角 8px / 阴影 |
| 表格 | 圆角溢出隐藏 / 隔行变色 / hover 高亮 |

### 暗色模式

- 通过 `@media (prefers-color-scheme: dark)` 覆盖 CSS 变量
- 深色背景使用 GitHub Dark 色板（`#0d1117` 底色，`#161b22` 面板）
- 所有颜色过渡带 `0.2s ease`，主题切换平滑

### 代码高亮

- 移除 highlight.js（客户端），仅使用 Pygments（服务端）通过 `codehilite` 扩展渲染
- Pygments CSS 在应用启动时通过 `Renderer.get_pygments_css()` 生成，注入到模板全局变量
- `base.html` 中以 `<style>` 内联输出 Pygments CSS

### 目录树折叠

- 渲染逻辑不变：`<span class="dir-label" onclick="toggleDir(this)">` + 子 `<ul>`
- 新增 `toggleDir()` JS 函数：切换 `.collapsed` class（控制箭头旋转）和子 `ul` 的 `display`
- CSS 中 `.dir-label::before` 显示 ▾ 箭头，`.collapsed::before` 旋转 -90°

### 静态文件

- FastAPI 挂载 `/static` 路由到 `static/` 目录
- 仅含 `style.css` 和 `.gitkeep`

## 涉及文件

- `static/style.css` — 新增，完整样式表
- `templates/base.html` — 移除 inline CSS 和 highlight.js，引入 `/static/style.css`，添加 `toggleDir` JS
- `main.py` — 添加 `StaticFiles` 挂载，注入 Pygments CSS 到模板
- `config.yaml` — `docs_root` 改为 `./docs`

## 未实现（可选后续）

- 侧栏搜索框实时过滤
- 自定义 Pygments 主题色（当前使用默认主题）
- 手动切换暗亮模式的按钮
- 目录树全部折叠/展开按钮
