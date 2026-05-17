# MDocs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dynamic web service that reads Markdown files from a configurable directory, with directory tree navigation, full-text search, and image support.

**Architecture:** FastAPI server with Jinja2 templates (server-side rendering), SQLite FTS5 for search, watchfiles for file change detection, and python-markdown for MD-to-HTML conversion. No SPA framework — uses HTMX for partial page updates.

**Tech Stack:** Python 3.10+, FastAPI, Uvicorn, Jinja2, python-markdown, Pygments, SQLite FTS5, watchfiles, PyYAML, HTMX (CDN), highlight.js (CDN)

---

### Task 1: Project Scaffolding

**Files:**
- Create: `/home/ubuntu/ai/mdocs/main.py`
- Create: `/home/ubuntu/ai/mdocs/config.yaml`
- Create: `/home/ubuntu/ai/mdocs/requirements.txt`
- Create: `/home/ubuntu/ai/mdocs/app/__init__.py`
- Create: `/home/ubuntu/ai/mdocs/app/config.py`
- Create: `/home/ubuntu/ai/mdocs/app/scanner.py`
- Create: `/home/ubuntu/ai/mdocs/app/search.py`
- Create: `/home/ubuntu/ai/mdocs/app/renderer.py`
- Create: `/home/ubuntu/ai/mdocs/app/watcher.py`
- Create: `/home/ubuntu/ai/mdocs/static/.gitkeep`
- Create: `/home/ubuntu/ai/mdocs/templates/base.html`
- Create: `/home/ubuntu/ai/mdocs/templates/index.html`
- Create: `/home/ubuntu/ai/mdocs/templates/search.html`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p /home/ubuntu/ai/mdocs/app
mkdir -p /home/ubuntu/ai/mdocs/templates
mkdir -p /home/ubuntu/ai/mdocs/static
touch /home/ubuntu/ai/mdocs/app/__init__.py
touch /home/ubuntu/ai/mdocs/static/.gitkeep
```

- [ ] **Step 2: Write requirements.txt**

```
fastapi>=0.110.0
uvicorn[standard]>=0.29.0
python-markdown>=3.6
pygments>=2.18
pyyaml>=6.0
watchfiles>=0.21
aiofiles>=23.2
```

- [ ] **Step 3: Write config.yaml**

```yaml
docs_root: ./docs
host: 0.0.0.0
port: 8000
```

- [ ] **Step 4: Write app/config.py**

```python
from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass
class Config:
    docs_root: str
    host: str = "0.0.0.0"
    port: int = 8000


def load_config(path: str = "config.yaml") -> Config:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")
    with open(path) as f:
        data = yaml.safe_load(f)
    return Config(**data)
```

- [ ] **Step 5: Write main.py (placeholder)**

```python
def main():
    pass

if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Verify scaffolding works**

```bash
cd /home/ubuntu/ai/mdocs && python -c "from app.config import load_config; print('OK')"
```

Expected output: `OK`

---

### Task 2: Directory Scanner Module

**Files:**
- Modify: `/home/ubuntu/ai/mdocs/app/scanner.py`

- [ ] **Step 1: Write scanner.py**

```python
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class DocNode:
    name: str
    path: str
    is_dir: bool
    children: list[DocNode] = field(default_factory=list)


class Scanner:
    def __init__(self, root: str):
        self.root = Path(root).resolve()
        self._tree: DocNode | None = None

    def scan(self) -> DocNode:
        self._tree = self._build_tree(self.root)
        return self._tree

    def get_tree(self) -> DocNode | None:
        return self._tree

    def _build_tree(self, directory: Path) -> DocNode:
        node = DocNode(name=directory.name, path="", is_dir=True)
        entries = sorted(directory.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
        for entry in entries:
            rel_path = str(entry.relative_to(self.root))
            if entry.is_dir():
                child = self._build_tree(entry)
                child.path = rel_path
                node.children.append(child)
            elif entry.suffix.lower() in {".md", ".markdown"}:
                node.children.append(DocNode(name=entry.name, path=rel_path, is_dir=False))
        return node

    def get_file_list(self) -> list[str]:
        result = []
        if self._tree is None:
            return result
        stack = [self._tree]
        while stack:
            node = stack.pop()
            if not node.is_dir:
                result.append(node.path)
            stack.extend(node.children)
        return result
```

- [ ] **Step 2: Verify scanner works**

```bash
cd /home/ubuntu/ai/mdocs && mkdir -p /tmp/test_docs/sub && echo "# Hello" > /tmp/test_docs/test.md && echo "# Sub" > /tmp/test_docs/sub/sub.md && python -c "
from app.scanner import Scanner
s = Scanner('/tmp/test_docs')
tree = s.scan()
print(tree.is_dir, tree.name)
print([c.name for c in tree.children])
print(s.get_file_list())
rm -rf /tmp/test_docs
"
```

Expected output:
```
True test_docs
['test.md', 'sub']
['test.md', 'sub/sub.md']
```

---

### Task 3: Search Engine Module (SQLite FTS5)

**Files:**
- Modify: `/home/ubuntu/ai/mdocs/app/search.py`

- [ ] **Step 1: Write search.py**

```python
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any


class SearchEngine:
    def __init__(self, db_path: str = ":memory:"):
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self._init_db()

    def _init_db(self) -> None:
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS docs (
                id INTEGER PRIMARY KEY,
                path TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT ''
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
                title, content, content=docs, content_rowid=id
            );
            CREATE TRIGGER IF NOT EXISTS docs_ai AFTER INSERT ON docs BEGIN
                INSERT INTO docs_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
            END;
            CREATE TRIGGER IF NOT EXISTS docs_ad AFTER DELETE ON docs BEGIN
                INSERT INTO docs_fts(docs_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
            END;
            CREATE TRIGGER IF NOT EXISTS docs_au AFTER UPDATE ON docs BEGIN
                INSERT INTO docs_fts(docs_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
                INSERT INTO docs_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
            END;
        """)
        self.conn.commit()

    def index_file(self, path: str, title: str, content: str) -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO docs (path, title, content) VALUES (?, ?, ?)",
            (path, title, content),
        )
        self.conn.commit()

    def remove_file(self, path: str) -> None:
        self.conn.execute("DELETE FROM docs WHERE path = ?", (path,))
        self.conn.commit()

    def search(self, query: str, limit: int = 50) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            """
            SELECT d.path, d.title, snippet(docs_fts, 1, '<b>', '</b>', '...', 32) AS snippet
            FROM docs_fts
            JOIN docs ON docs_fts.rowid = docs.id
            WHERE docs_fts MATCH ?
            ORDER BY rank
            LIMIT ?
            """,
            (query, limit),
        ).fetchall()
        return [dict(r) for r in rows]

    def rebuild_index(self, docs_root: str) -> None:
        self.conn.execute("DELETE FROM docs")
        root = Path(docs_root)
        for md_file in root.rglob("*"):
            if md_file.suffix.lower() not in {".md", ".markdown"}:
                continue
            rel_path = str(md_file.relative_to(root))
            content = md_file.read_text(encoding="utf-8", errors="replace")
            title = self._extract_title(content) or md_file.stem
            self.index_file(rel_path, title, content)

    def _extract_title(self, content: str) -> str:
        for line in content.splitlines():
            line = line.strip()
            if line.startswith("# ") or line.startswith("#\t"):
                return line.lstrip("# \t")
        return ""

    def close(self) -> None:
        self.conn.close()
```

- [ ] **Step 2: Verify search works**

```bash
cd /home/ubuntu/ai/mdocs && python -c "
from app.search import SearchEngine
s = SearchEngine()
s.index_file('test.md', 'Test Page', '# Hello World')
s.index_file('sub/doc.md', 'Doc Page', 'This is about Python programming')
results = s.search('python')
print('Results:', results)
results2 = s.search('hello')
print('Results2:', results2)
s.close()
"
```

Expected output: two result lists with matching docs.

---

### Task 4: Markdown Renderer Module

**Files:**
- Modify: `/home/ubuntu/ai/mdocs/app/renderer.py`

- [ ] **Step 1: Write renderer.py**

```python
from __future__ import annotations

import markdown
from pygments.formatters import HtmlFormatter


class Renderer:
    def __init__(self):
        self.md = markdown.Markdown(
            extensions=[
                "fenced_code",
                "tables",
                "toc",
                "codehilite",
                "sane_lists",
                "nl2br",
            ],
            extension_configs={
                "codehilite": {
                    "css_class": "highlight",
                    "guess_lang": True,
                },
                "toc": {
                    "permalink": True,
                },
            },
        )

    def render(self, content: str) -> str:
        self.md.reset()
        return self.md.convert(content)

    @staticmethod
    def extract_title(content: str) -> str:
        for line in content.splitlines():
            line = line.strip()
            if line.startswith("# ") or line.startswith("#\t"):
                return line.lstrip("# \t")
        return ""

    @staticmethod
    def get_pygments_css() -> str:
        return HtmlFormatter().get_style_defs(".highlight")
```

- [ ] **Step 2: Verify renderer works**

```bash
cd /home/ubuntu/ai/mdocs && python -c "
from app.renderer import Renderer
r = Renderer()
html = r.render('# Hello\n\nThis is **bold** and `code`.')
print(html)
print('---')
print(r.extract_title('# Hello World'))
print(r.extract_title('No heading'))
"
```

Expected output: rendered HTML with heading, bold, code, and extracted title.

---

### Task 5: File Watcher Module

**Files:**
- Modify: `/home/ubuntu/ai/mdocs/app/watcher.py`

- [ ] **Step 1: Write watcher.py**

```python
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Callable, Awaitable

from watchfiles import awatch


class Watcher:
    def __init__(
        self,
        root: str,
        on_change: Callable[[str], Awaitable[None]],
        on_delete: Callable[[str], Awaitable[None]],
    ):
        self.root = Path(root).resolve()
        self.on_change = on_change
        self.on_delete = on_delete

    async def start(self) -> None:
        async for changes in awatch(self.root):
            for change_type, change_path in changes:
                path = Path(change_path)
                if path.suffix.lower() not in {".md", ".markdown"}:
                    continue
                rel_path = str(path.relative_to(self.root))
                if change_type == "deleted":
                    await self.on_delete(rel_path)
                else:
                    await self.on_change(rel_path)
```

- [ ] **Step 2: Verify import works**

```bash
cd /home/ubuntu/ai/mdocs && python -c "from app.watcher import Watcher; print('OK')"
```

Expected output: `OK`

---

### Task 6: Templates

**Files:**
- Modify: `/home/ubuntu/ai/mdocs/templates/base.html`
- Modify: `/home/ubuntu/ai/mdocs/templates/index.html`
- Modify: `/home/ubuntu/ai/mdocs/templates/search.html`

- [ ] **Step 1: Write base.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{% block title %}MDocs{% endblock %}</title>
    <script src="https://unpkg.com/htmx.org@1.9.12"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
    <script>hljs.highlightAll();</script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; min-height: 100vh; background: #f8f9fa; color: #333; }
        header { background: #2c3e50; color: #fff; padding: 12px 24px; display: flex; align-items: center; gap: 16px; }
        header a { color: #fff; text-decoration: none; font-size: 18px; font-weight: 600; }
        .search-form { display: flex; gap: 8px; margin-left: auto; }
        .search-form input { padding: 6px 12px; border: none; border-radius: 4px; width: 240px; font-size: 14px; }
        .search-form button { padding: 6px 16px; background: #3498db; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
        .layout { display: flex; flex: 1; }
        .sidebar { width: 280px; background: #fff; border-right: 1px solid #dee2e6; padding: 16px; overflow-y: auto; flex-shrink: 0; }
        .sidebar ul { list-style: none; padding-left: 16px; }
        .sidebar > ul { padding-left: 0; }
        .sidebar li { margin: 2px 0; }
        .sidebar a { display: block; padding: 4px 8px; color: #333; text-decoration: none; border-radius: 4px; font-size: 14px; }
        .sidebar a:hover { background: #e9ecef; }
        .sidebar .dir-label { padding: 4px 8px; font-weight: 600; color: #555; font-size: 14px; cursor: pointer; }
        .sidebar .dir-label:hover { background: #e9ecef; border-radius: 4px; }
        .content { flex: 1; padding: 32px 48px; overflow-y: auto; max-width: 900px; }
        .content img { max-width: 100%; height: auto; }
        .content pre { background: #f6f8fa; border-radius: 6px; padding: 16px; overflow-x: auto; }
        .content code { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; }
        .content h1, .content h2, .content h3 { margin-top: 24px; margin-bottom: 12px; }
        .content p { margin-bottom: 16px; line-height: 1.7; }
        .content table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
        .content th, .content td { border: 1px solid #dee2e6; padding: 8px 12px; text-align: left; }
        .content th { background: #f1f3f5; }
        .empty-state { padding: 48px; text-align: center; color: #888; }
        .result-item { padding: 12px 16px; border-bottom: 1px solid #eee; }
        .result-item a { font-size: 16px; font-weight: 600; color: #2c3e50; text-decoration: none; }
        .result-item a:hover { text-decoration: underline; }
        .result-item .path { font-size: 12px; color: #888; margin: 2px 0; }
        .result-item .snippet { font-size: 14px; color: #555; margin-top: 4px; }
        .result-item .snippet b { background: #fff3cd; }
        @media (max-width: 768px) {
            .sidebar { display: none; }
            .content { padding: 16px; }
        }
    </style>
    {% block extra_head %}{% endblock %}
</head>
<body>
    <header>
        <a href="/">MDocs</a>
        <form class="search-form" action="/search" method="get">
            <input type="text" name="q" placeholder="搜索文档..." value="{{ query or '' }}">
            <button type="submit">搜索</button>
        </form>
    </header>
    <div class="layout">
        <nav class="sidebar" id="sidebar">
            {{ tree_html|safe }}
        </nav>
        <main class="content" id="content">
            {% block content %}{% endblock %}
        </main>
    </div>
</body>
</html>
```

- [ ] **Step 2: Write a Jinja2 macro for directory tree rendering**

Create `templates/macros.html`:

```html
{% macro render_tree(node) %}
{% if node.is_dir %}
<li>
    <span class="dir-label" onclick="toggleDir(this)">{{ node.name }}/</span>
    {% if node.children %}
    <ul>
        {% for child in node.children %}
        {{ render_tree(child) }}
        {% endfor %}
    </ul>
    {% endif %}
</li>
{% else %}
<li><a href="/view/{{ node.path }}" hx-get="/view/{{ node.path }}" hx-target="#content" hx-push-url="true">{{ node.name }}</a></li>
{% endif %}
{% endmacro %}
```

And inline the toggle JS in base.html `<script>` block:

```html
<script>
function toggleDir(el) {
    var ul = el.nextElementSibling;
    if (ul) ul.style.display = ul.style.display === 'none' ? '' : 'none';
}
</script>
```

- [ ] **Step 3: Write index.html**

```html
{% extends "base.html" %}
{% block title %}MDocs{% endblock %}
{% block content %}
{% if doc_html %}
    {{ doc_html|safe }}
{% else %}
    <div class="empty-state">
        <h2>欢迎使用 MDocs</h2>
        <p>从左侧目录树选择文档查看</p>
    </div>
{% endif %}
{% endblock %}
```

- [ ] **Step 4: Write search.html**

```html
{% extends "base.html" %}
{% block title %}搜索: {{ query }} - MDocs{% endblock %}
{% block content %}
<h2>搜索: "{{ query }}"</h2>
<p style="color:#888;margin-bottom:16px;">共 {{ results|length }} 条结果</p>
{% if results %}
    {% for r in results %}
    <div class="result-item">
        <a href="/view/{{ r.path }}" hx-get="/view/{{ r.path }}" hx-target="#content" hx-push-url="true">{{ r.title }}</a>
        <div class="path">{{ r.path }}</div>
        {% if r.snippet %}
        <div class="snippet">{{ r.snippet|safe }}</div>
        {% endif %}
    </div>
    {% endfor %}
{% else %}
    <p>未找到匹配结果。</p>
{% endif %}
{% endblock %}
```

- [ ] **Step 5: Verify template rendering (manual import check)**

```bash
cd /home/ubuntu/ai/mdocs && python -c "
from jinja2 import Environment, FileSystemLoader
env = Environment(loader=FileSystemLoader('templates'))
tmpl = env.get_template('base.html')
print('Templates loaded OK')
"
```

Expected output: `Templates loaded OK`

---

### Task 7: Main Application — FastAPI Routes

**Files:**
- Modify: `/home/ubuntu/ai/mdocs/main.py`

- [ ] **Step 1: Write main.py**

```python
from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from jinja2 import Environment, FileSystemLoader

from app.config import load_config, Config
from app.scanner import Scanner
from app.search import SearchEngine
from app.renderer import Renderer
from app.watcher import Watcher

config: Config
scanner: Scanner
search: SearchEngine
renderer: Renderer
env: Environment
app = FastAPI(title="MDocs")


def render_tree_html(node) -> str:
    lines = ["<ul>"]
    for child in node.children:
        if child.is_dir:
            lines.append('<li>')
            lines.append(f'<span class="dir-label" onclick="toggleDir(this)">{child.name}/</span>')
            if child.children:
                lines.append("<ul>")
                for sub in child.children:
                    if sub.is_dir:
                        lines.append(render_tree_html_recursive(sub))
                    else:
                        lines.append(f'<li><a href="/view/{sub.path}" hx-get="/view/{sub.path}" hx-target="#content" hx-push-url="true">{sub.name}</a></li>')
                lines.append("</ul>")
            lines.append('</li>')
        else:
            lines.append(f'<li><a href="/view/{child.path}" hx-get="/view/{child.path}" hx-target="#content" hx-push-url="true">{child.name}</a></li>')
    lines.append("</ul>")
    return "\n".join(lines)


def render_tree_html_recursive(node) -> str:
    parts = [f'<span class="dir-label" onclick="toggleDir(this)">{node.name}/</span>']
    if node.children:
        parts.append("<ul>")
        for child in node.children:
            if child.is_dir:
                parts.append(f"<li>{render_tree_html_recursive(child)}</li>")
            else:
                parts.append(f'<li><a href="/view/{child.path}" hx-get="/view/{child.path}" hx-target="#content" hx-push-url="true">{child.name}</a></li>')
        parts.append("</ul>")
    return "\n".join(parts)


def get_tree_html() -> str:
    tree = scanner.get_tree()
    if tree is None:
        return "<p>无文档</p>"
    return render_tree_html(tree)


@app.on_event("startup")
async def startup():
    global config, scanner, search, renderer, env
    config = load_config()
    docs_root = Path(config.docs_root)
    if not docs_root.exists():
        raise RuntimeError(f"docs_root does not exist: {config.docs_root}")

    renderer = Renderer()
    scanner = Scanner(str(docs_root))
    scanner.scan()

    search = SearchEngine()
    search.rebuild_index(str(docs_root))

    env = Environment(loader=FileSystemLoader("templates"))

    watcher = Watcher(
        root=str(docs_root),
        on_change=_on_file_change,
        on_delete=_on_file_delete,
    )
    asyncio.create_task(watcher.start())


async def _on_file_change(rel_path: str):
    full_path = Path(config.docs_root) / rel_path
    try:
        content = full_path.read_text(encoding="utf-8", errors="replace")
    except FileNotFoundError:
        return
    title = renderer.extract_title(content)
    search.index_file(rel_path, title, content)
    scanner.scan()


async def _on_file_delete(rel_path: str):
    search.remove_file(rel_path)
    scanner.scan()


@app.get("/", response_class=HTMLResponse)
async def home():
    tree_html = get_tree_html()
    template = env.get_template("index.html")
    return template.render(tree_html=tree_html, doc_html=None, query="")


@app.get("/view/{path:path}", response_class=HTMLResponse)
async def view_doc(path: str, request: Request):
    full_path = Path(config.docs_root) / path
    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail="Document not found")
    if full_path.suffix.lower() not in {".md", ".markdown"}:
        raise HTTPException(status_code=400, detail="Not a markdown file")
    content = full_path.read_text(encoding="utf-8", errors="replace")
    html = renderer.render(content)
    tree_html = get_tree_html()
    template = env.get_template("index.html")
    return template.render(tree_html=tree_html, doc_html=html, query="")


@app.get("/search", response_class=HTMLResponse)
async def search_docs(q: str = "", request: Request):
    results = []
    if q.strip():
        fts_query = " OR ".join(q.strip().split())
        results = search.search(fts_query)
    tree_html = get_tree_html()
    template = env.get_template("search.html")
    return template.render(tree_html=tree_html, results=results, query=q)


@app.get("/api/tree")
async def api_tree():
    tree = scanner.get_tree()
    if tree is None:
        return {"name": "root", "is_dir": True, "children": []}
    return _node_to_dict(tree)


def _node_to_dict(node) -> dict:
    return {
        "name": node.name,
        "path": node.path,
        "is_dir": node.is_dir,
        "children": [_node_to_dict(c) for c in node.children] if node.children else [],
    }


app.mount("/static", StaticFiles(directory="static"), name="static")


def main():
    import uvicorn
    uvicorn.run("main:app", host=config.host, port=config.port, reload=True)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verify the app imports without error**

```bash
cd /home/ubuntu/ai/mdocs && python -c "from main import app; print('App loaded OK')"
```

Expected output: `App loaded OK` (may show a warning about docs_root, that's fine)

---

### Task 8: Handle Image Serving

**Files:**
- Modify: `/home/ubuntu/ai/mdocs/main.py`

- [ ] **Step 1: Add custom static file mount for docs_root images**

Replace the existing static mount in main.py. The Markdown images reference paths relative to the docs_root, so we need to mount docs_root at `/static/` path:

```python
# Remove the original static mount:
# app.mount("/static", StaticFiles(directory="static"), name="static")

# Instead mount docs_root at /static/ for image serving
# and also keep a small static/ for any project-level assets if needed
```

But we need to be careful — `/static/` should serve images from the `docs_root` directory. We can mount the docs_root at a different path, and mount the local `static/` at a different path. Let me think about this...

Actually, simpler approach: mount `docs_root` under a `/media/` prefix for images. In the Markdown renderer, rewrite image paths to point to `/media/`.

Let me adjust:

In `main.py`:

```python
# Mount docs_root for image access
app.mount("/media", StaticFiles(directory=config.docs_root), name="media")
```

In `renderer.py`, add a method to rewrite image paths:

```python
import re

def render_with_media_prefix(self, content: str, docs_root: str) -> str:
    """Render markdown, prefixing relative image paths with /media/"""
    def _rewrite_img(m):
        alt = m.group(1)
        src = m.group(2)
        if not src.startswith(("http://", "https://", "/")):
            src = f"/media/{src}"
        return f'<img alt="{alt}" src="{src}" />'
    html = self.render(content)
    html = re.sub(r'<img alt="(.*?)" src="(.*?)" />', _rewrite_img, html)
    return html
```

Actually, it's simpler to use python-markdown's built-in pattern. Or just use a simple regex after rendering.

Let me adjust the plan to use a post-processing step in the view_doc route.

- [ ] **Step 2: Update view_doc to rewrite image paths**

```python
import re

@app.get("/view/{path:path}", response_class=HTMLResponse)
async def view_doc(path: str, request: Request):
    full_path = Path(config.docs_root) / path
    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail="Document not found")
    if full_path.suffix.lower() not in {".md", ".markdown"}:
        raise HTTPException(status_code=400, detail="Not a markdown file")
    content = full_path.read_text(encoding="utf-8", errors="replace")
    html = renderer.render(content)
    # Rewrite relative image paths to use /media/ prefix
    html = re.sub(
        r'<img\s+([^>]*?)src="(?!https?://|/)([^"]+)"([^>]*?)>',
        r'<img\1src="/media/\2"\3>',
        html,
    )
    tree_html = get_tree_html()
    template = env.get_template("index.html")
    return template.render(tree_html=tree_html, doc_html=html, query="")
```

- [ ] **Step 3: Add media route for image serving**

Add a route to serve images from docs_root:

```python
from fastapi.responses import FileResponse

@app.get("/media/{path:path}")
async def media(path: str):
    full_path = Path(config.docs_root) / path
    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(full_path)
```

- [ ] **Step 4: Verify end-to-end — start the server with a test docs directory**

```bash
cd /home/ubuntu/ai/mdocs && mkdir -p /tmp/mdocs_test/sub && cat > /tmp/mdocs_test/test.md << 'EOF'
# Hello World

This is a test document.

## Code Example

```python
print("hello")
```

## Image

![test image](sub/image.png)
EOF
echo "Test image" > /tmp/mdocs_test/sub/image.png
cat > /tmp/mdocs_test/sub/another.md << 'EOF'
# Sub Directory Doc

Content in subdirectory.
EOF
# Temporarily modify config.yaml to point to test dir
cp config.yaml config.yaml.bak
echo "docs_root: /tmp/mdocs_test" > config.yaml
# Start in background and test
timeout 5 python -c "import uvicorn; uvicorn.run('main:app', host='0.0.0.0', port=8000, log_level='info')" &
sleep 2
curl -s http://localhost:8000/ | head -20
curl -s http://localhost:8000/view/test.md | head -20
curl -s 'http://localhost:8000/search?q=hello' | head -20
kill %1 2>/dev/null
mv config.yaml.bak config.yaml
rm -rf /tmp/mdocs_test
```

Expected: server returns pages for home, view, and search routes.

---

### Task 9: Final Integration and Documentation

- [ ] **Step 1: Verify all files exist and import cleanly**

```bash
cd /home/ubuntu/ai/mdocs && python -c "
from app.config import load_config, Config
from app.scanner import Scanner, DocNode
from app.search import SearchEngine
from app.renderer import Renderer
from app.watcher import Watcher
from main import app
print('All imports OK')
"
```

Expected: `All imports OK`

- [ ] **Step 2: Create a sample docs directory and config for demo**

```bash
mkdir -p /home/ubuntu/ai/mdocs/example_docs/sub
cat > /home/ubuntu/ai/mdocs/example_docs/index.md << 'EOF'
# 欢迎

这是示例文档目录。
EOF
cat > /home/ubuntu/ai/mdocs/example_docs/sub/doc.md << 'EOF'
# 子目录文档

这是一个嵌套目录中的文档。
EOF
```

- [ ] **Step 3: Update config.yaml to point to example_docs**

```yaml
docs_root: ./example_docs
host: 0.0.0.0
port: 8000
```

- [ ] **Step 4: Re-import and verify**

```bash
cd /home/ubuntu/ai/mdocs && python -c "
from app.config import load_config
cfg = load_config()
print(f'Config loaded: docs_root={cfg.docs_root}, host={cfg.host}, port={cfg.port}')
from app.scanner import Scanner
s = Scanner(cfg.docs_root)
tree = s.scan()
print(f'Tree root: {tree.name}, children: {[c.name for c in tree.children]}')
from app.search import SearchEngine
se = SearchEngine()
se.rebuild_index(cfg.docs_root)
results = se.search('欢迎')
print(f'Search results: {results}')
se.close()
"
```

Expected: config loaded, tree with files, search returning results.
