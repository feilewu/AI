from __future__ import annotations

import asyncio
import html
import re
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse
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
BASE_DIR = Path(__file__).parent
app = FastAPI(title="MDocs")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")


def _render_tree(node, is_root: bool = False) -> str:
    parts = []
    if not is_root:
        parts.append(f'<span class="dir-label" onclick="toggleDir(this)">{html.escape(node.name)}/</span>')
    if node.children:
        parts.append("<ul>")
        for child in node.children:
            if child.is_dir:
                parts.append(f"<li>{_render_tree(child)}</li>")
            else:
                safe_path = html.escape(child.path, quote=True)
                safe_name = html.escape(child.name)
                parts.append(
                    f'<li><a href="/view/{safe_path}" '
                    f'hx-get="/view/{safe_path}" '
                    f'hx-target="#content" '
                    f'hx-push-url="true">{safe_name}</a></li>'
                )
        parts.append("</ul>")
    return "\n".join(parts)


def get_tree_html() -> str:
    tree = scanner.get_tree()
    if tree is None:
        return "<p>无文档</p>"
    return _render_tree(tree, is_root=True)


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

    env = Environment(loader=FileSystemLoader(str(BASE_DIR / "templates")))
    env.globals["pygments_css"] = renderer.get_pygments_css()

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


def _resolve_safe(base: str, path: str) -> Path:
    resolved = (Path(base) / path).resolve()
    base_resolved = Path(base).resolve()
    if not str(resolved).startswith(str(base_resolved) + "/") and resolved != base_resolved:
        raise HTTPException(status_code=403, detail="Access denied")
    return resolved


@app.get("/view/{path:path}", response_class=HTMLResponse)
async def view_doc(request: Request, path: str):
    full_path = _resolve_safe(config.docs_root, path)
    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail="Document not found")
    if full_path.suffix.lower() not in {".md", ".markdown"}:
        raise HTTPException(status_code=400, detail="Not a markdown file")
    content = full_path.read_text(encoding="utf-8", errors="replace")
    doc_html = renderer.render(content)
    doc_html = re.sub(
        r'<img\s+([^>]*?)src="(?!https?://|/)([^"]+)"([^>]*?)>',
        r'<img\1src="/media/\2"\3>',
        doc_html,
    )
    is_hx = request.headers.get("hx-request") == "true"
    if is_hx:
        return doc_html
    tree_html = get_tree_html()
    template = env.get_template("index.html")
    return template.render(tree_html=tree_html, doc_html=doc_html, query="")


@app.get("/search", response_class=HTMLResponse)
async def search_docs(request: Request, q: str = ""):
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


@app.get("/media/{path:path}")
async def media(path: str):
    full_path = _resolve_safe(config.docs_root, path)
    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(full_path)


def main():
    import uvicorn
    cfg = load_config()
    uvicorn.run("main:app", host=cfg.host, port=cfg.port, reload=True)


if __name__ == "__main__":
    main()
