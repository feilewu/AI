# MDocs — Markdown 文档展示 Web 服务

## 概述

一个动态 Web 服务，读取指定目录下的 Markdown 文件，提供目录浏览、全文搜索、图片展示功能。支持目录嵌套，即改即用。

## 技术栈

- **语言**: Python 3.10+
- **框架**: FastAPI
- **模板**: Jinja2
- **Markdown 渲染**: python-markdown + Pygments（代码高亮）
- **搜索**: SQLite FTS5（零外部依赖）
- **文件监听**: watchfiles（增量索引更新）
- **前端**: 原生 HTML + HTMX + highlight.js

## 配置

通过 `config.yaml` 加载：

```yaml
docs_root: /path/to/markdown/files   # MD 文件根目录
host: 0.0.0.0                         # 监听地址
port: 8000                            # 监听端口
```

启动时校验 `docs_root` 目录是否存在。

## 架构

```
FastAPI Server
├── 静态文件服务 (图片等资源)
├── Jinja2 模板渲染 (目录树 + 文档内容)
├── SQLite FTS5 全文搜索
│   ├── 启动时全量构建
│   └── watchfiles 增量更新
└── 文件系统扫描器
    ├── 递归扫描构建目录树
    └── 缓存于内存
```

## 路由

| 路由 | 方法 | 功能 |
|------|------|------|
| `/` | GET | 首页，根目录文档列表 |
| `/view/{path:path}` | GET | 渲染 MD 文件为 HTML |
| `/search?q=` | GET | 全文搜索结果 |
| `/static/{path:path}` | GET | 图片等静态资源 |
| `/api/tree` | GET | 返回目录树 JSON |

## 数据模型

```sql
CREATE TABLE docs (
    id INTEGER PRIMARY KEY,
    path TEXT UNIQUE,
    title TEXT,
    content TEXT
);

CREATE VIRTUAL TABLE docs_fts USING fts5(
    title, content, content=docs, content_rowid=id
);
```

## Markdown 渲染扩展

- `fenced_code` — 围栏代码块
- `tables` — 表格
- `toc` — 目录锚点
- `codehilite` — 代码语法高亮 (Pygments)
- `sane_lists` — 整洁列表

图片相对路径自动拼接 `docs_root`，通过 `/static/` 路由提供。

## 前端页面

### 文档浏览页
左右布局：左侧可折叠目录树，右侧 Markdown 渲染内容。点击目录项通过 HTMX 局部刷新内容区。

### 搜索结果页
搜索框位于顶栏，结果列表含路径、匹配片段高亮。

## 目录结构

```
mdocs/
├── main.py              # 应用入口
├── config.yaml          # 配置文件
├── requirements.txt     # 依赖
├── app/
│   ├── __init__.py
│   ├── config.py        # 配置加载
│   ├── scanner.py       # 目录树扫描 + 缓存
│   ├── search.py        # SQLite FTS5 索引与查询
│   ├── renderer.py      # Markdown → HTML 渲染
│   └── watcher.py       # 文件变更监听
├── templates/
│   ├── base.html        # 基础布局
│   ├── index.html       # 首页/浏览页
│   └── search.html      # 搜索结果页
└── static/
    └── (空，运行时 docs_root 的图片通过 /static/ 路由访问)
```

## 工程配置

- `requirements.txt`: fastapi, uvicorn, python-markdown, pygments, pyyaml, watchfiles, aiofiles
- 启动: `uvicorn main:app --reload`
