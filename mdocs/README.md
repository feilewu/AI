# MDocs — Markdown 文档展示 Web 服务

动态 Web 服务，读取指定目录下的 Markdown 文件，提供目录浏览、全文搜索、图片展示功能。支持目录嵌套，即改即用。

## 快速开始

```bash
cd mdocs
pip install -r requirements.txt
python main.py
```

打开浏览器访问 `http://localhost:8000`。

## 配置

编辑 `config.yaml`：

```yaml
docs_root: ./example_docs   # MD 文件根目录（绝对或相对路径）
host: 0.0.0.0               # 监听地址
port: 8000                  # 监听端口
```

## 功能

| 功能 | 说明 |
|------|------|
| 目录浏览 | 左侧可折叠目录树，支持嵌套子目录 |
| 文档渲染 | 代码高亮、表格、TOC 锚点 |
| 全文搜索 | 支持中文/英文，搜索结果含匹配高亮片段 |
| 图片展示 | Markdown 中的相对路径图片自动映射到 `/media/` |
| 热更新 | 文件新增/修改/删除后，目录和搜索索引自动同步 |
| 响应式 | 移动端自动隐藏侧边栏 |

## 目录结构

```
mdocs/
├── main.py              # 应用入口
├── config.yaml          # 配置文件
├── requirements.txt     # Python 依赖
├── app/                 # 核心模块
│   ├── config.py        # 配置加载
│   ├── scanner.py       # 目录树扫描
│   ├── search.py        # SQLite FTS5 全文搜索
│   ├── renderer.py      # Markdown 渲染
│   └── watcher.py       # 文件变更监听
├── templates/           # Jinja2 模板
│   ├── base.html
│   ├── index.html
│   └── search.html
├── static/              # 静态资源目录
└── example_docs/        # 示例文档
```

## 接口

| 路由 | 说明 |
|------|------|
| `/` | 首页 |
| `/view/{path}` | 查看文档 |
| `/search?q=` | 全文搜索 |
| `/media/{path}` | 图片等静态资源 |
| `/api/tree` | 目录树 JSON |
