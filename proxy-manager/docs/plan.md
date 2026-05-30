# Proxy Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build a web service that provides a unified entry point to access multiple local HTTP services via path-prefix routing, with automatic service discovery and Web UI management.

**Architecture:** Single FastAPI process with ASGI middleware that intercepts requests and proxies matching paths to target services using httpx. SQLite stores service configurations. Auto-scan detects local HTTP services by parsing `ss -tlnp` output and probing ports.

**Tech Stack:** Python FastAPI, httpx, HTMX, SQLite, Jinja2

---

## File Structure

```
/home/ubuntu/ai/proxy-manager/
├── main.py              # FastAPI app: routes, middleware, startup
├── database.py          # SQLite data layer
├── scanner.py           # Port scan + HTTP probe
├── proxy.py             # httpx proxy forwarding logic
├── config.py            # Config dataclass + loader
├── config.yaml          # Host/port/db_path config
├── requirements.txt     # Python dependencies
├── templates/
│   ├── base.html        # Layout template
│   └── dashboard.html   # Main dashboard
├── static/
│   └── style.css        # Styles
├── Dockerfile           # Docker build
├── docker-compose.yml   # Docker compose
└── data/                # SQLite storage (created at runtime)
```

---

### Task 1: Project scaffold

**Files:**
- Create: `config.py`
- Create: `config.yaml`
- Create: `requirements.txt`
- Create: `data/.gitkeep`

- [x] **Step 1: Create `config.py`**

```python
from dataclasses import dataclass
from pathlib import Path
import yaml


@dataclass
class Config:
    host: str = "0.0.0.0"
    port: int = 8090
    db_path: str = "data/proxy-manager.db"


def load_config(path: str = "config.yaml") -> Config:
    path = Path(path)
    if not path.exists():
        return Config()
    with open(path) as f:
        data = yaml.safe_load(f)
    return Config(**data)
```

- [x] **Step 2: Create `config.yaml`**

```yaml
host: 0.0.0.0
port: 8090
db_path: data/proxy-manager.db
```

- [x] **Step 3: Create `requirements.txt`**

```
fastapi>=0.110.0
uvicorn[standard]>=0.29.0
httpx>=0.27.0
pyyaml>=6.0
jinja2>=3.1
websockets>=12.0
```

- [x] **Step 4: Create `data/.gitkeep`**

Empty file.

---

### Task 2: Database layer (database.py)

**Files:**
- Create: `database.py`

- [x] **Step 1: Write `database.py`**

```python
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


class Database:
    def __init__(self, db_path: str):
        path = Path(db_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._create_tables()

    def _create_tables(self):
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS services (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                path_prefix TEXT NOT NULL UNIQUE,
                target_host TEXT DEFAULT 'localhost',
                target_port INTEGER NOT NULL,
                enabled BOOLEAN DEFAULT TRUE,
                auto_detected BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        self.conn.commit()

    def list_services(self) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM services ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]

    def get_service(self, service_id: int) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM services WHERE id = ?", (service_id,)
        ).fetchone()
        return dict(row) if row else None

    def add_service(self, name: str, path_prefix: str, target_port: int,
                    target_host: str = "localhost", auto_detected: bool = False) -> int:
        cur = self.conn.execute(
            """INSERT INTO services (name, path_prefix, target_host, target_port, auto_detected)
               VALUES (?, ?, ?, ?, ?)""",
            (name, path_prefix, target_host, target_port, auto_detected),
        )
        self.conn.commit()
        return cur.lastrowid

    def update_service(self, service_id: int, name: str = None, path_prefix: str = None,
                       target_host: str = None, target_port: int = None,
                       enabled: bool = None) -> bool:
        fields = []
        values = []
        if name is not None:
            fields.append("name = ?")
            values.append(name)
        if path_prefix is not None:
            fields.append("path_prefix = ?")
            values.append(path_prefix)
        if target_host is not None:
            fields.append("target_host = ?")
            values.append(target_host)
        if target_port is not None:
            fields.append("target_port = ?")
            values.append(target_port)
        if enabled is not None:
            fields.append("enabled = ?")
            values.append(int(enabled))
        if not fields:
            return False
        fields.append("updated_at = ?")
        values.append(datetime.now(timezone.UTC).isoformat())
        values.append(service_id)
        self.conn.execute(
            f"UPDATE services SET {', '.join(fields)} WHERE id = ?", values
        )
        self.conn.commit()
        return True

    def delete_service(self, service_id: int):
        self.conn.execute("DELETE FROM services WHERE id = ?", (service_id,))
        self.conn.commit()

    def get_enabled_services(self) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM services WHERE enabled = TRUE ORDER BY path_prefix ASC"
        ).fetchall()
        return [dict(r) for r in rows]
```

---

### Task 3: Proxy forwarding (proxy.py)

**Files:**
- Create: `proxy.py`

- [x] **Step 1: Write `proxy.py`**

```python
from fastapi import Request
from fastapi.responses import StreamingResponse
import httpx


async def proxy_request(request: Request, target_host: str, target_port: int, prefix: str):
    path = request.url.path
    query = request.url.query
    target_path = path[len(prefix):] if path.startswith(prefix) else path
    if not target_path.startswith("/"):
        target_path = "/" + target_path
    if query:
        target_path += f"?{query}"

    url = f"http://{target_host}:{target_port}{target_path}"

    headers = dict(request.headers)
    headers.pop("host", None)

    body = await request.body()

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.request(
                method=request.method,
                url=url,
                headers=headers,
                content=body,
                timeout=30,
            )
        except httpx.RequestError as e:
            return StreamingResponse(
                content=[f"Proxy error: {e}".encode()],
                status_code=502,
                media_type="text/plain",
            )

    response_headers = dict(resp.headers)
    response_headers.pop("content-encoding", None)
    response_headers.pop("transfer-encoding", None)
    response_headers.pop("content-length", None)

    return StreamingResponse(
        content=resp.aiter_bytes(),
        status_code=resp.status_code,
        headers=response_headers,
        media_type=resp.headers.get("content-type"),
    )
```

---

### Task 4: Port scanner (scanner.py)

**Files:**
- Create: `scanner.py`

- [x] **Step 1: Write `scanner.py`**

```python
import asyncio
import re
import httpx


async def scan_ports(exclude_ports: set[int] = None) -> list[dict]:
    exclude = set(exclude_ports or [])
    exclude.add(8090)  # default proxy port

    proc = await asyncio.create_subprocess_exec(
        "ss", "-tlnp",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()

    ports = set()
    for line in stdout.decode().splitlines():
        m = re.search(r":(\d+)\s", line)
        if m:
            port = int(m.group(1))
            if port not in exclude:
                ports.add(port)

    detected = []
    for port in sorted(ports):
        service = await _probe_port(port)
        if service:
            detected.append(service)

    return detected


async def _probe_port(port: int) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            resp = await client.get(f"http://localhost:{port}/")
            if resp.status_code < 500:
                server = resp.headers.get("server", "")
                ct = resp.headers.get("content-type", "")
                name = _guess_name(port, server) or f"service-{port}"
                return {
                    "port": port,
                    "name": name,
                    "server": server,
                    "content_type": ct,
                    "status": resp.status_code,
                }
    except (httpx.RequestError, httpx.TimeoutException):
        pass
    return None


def _guess_name(port: int, server: str) -> str | None:
    server_lower = server.lower()
    if "nginx" in server_lower:
        return "nginx"
    if "apache" in server_lower or "httpd" in server_lower:
        return "apache"
    if "caddy" in server_lower:
        return "caddy"
    if "node" in server_lower or "express" in server_lower:
        return f"node-app-{port}"
    if "python" in server_lower:
        return f"python-app-{port}"
    return None
```

---

### Task 5: Main FastAPI app (main.py)

**Files:**
- Create: `main.py`

- [x] **Step 1: Write `main.py`**

```python
import sys
from pathlib import Path

BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

import asyncio
import logging
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from jinja2 import Environment, FileSystemLoader

from config import load_config
from database import Database
from proxy import proxy_request
from scanner import scan_ports

config = load_config()
db = Database(config.db_path)

env = Environment(loader=FileSystemLoader(str(BASE_DIR / "templates")))

app = FastAPI(title="Proxy Manager")
logger = logging.getLogger("proxy-manager")

static_dir = BASE_DIR / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


# ── Proxy Middleware ──────────────────────────────────────────────────

@app.middleware("http")
async def proxy_middleware(request: Request, call_next):
    path = request.url.path
    if path.startswith("/static/"):
        return await call_next(request)

    services = db.get_enabled_services()
    for svc in services:
        prefix = f"/{svc['path_prefix']}"
        if path == prefix or path.startswith(prefix + "/"):
            return await proxy_request(request, svc["target_host"], svc["target_port"], prefix)

    return await call_next(request)


# ── Web UI ────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def dashboard():
    services = db.list_services()
    template = env.get_template("dashboard.html")
    return template.render(services=services)


# ── REST API ──────────────────────────────────────────────────────────

@app.get("/api/services")
async def api_list_services():
    services = db.list_services()
    return JSONResponse({"services": services})


@app.post("/api/services")
async def api_add_service(request: Request):
    data = await request.json()
    name = data.get("name", "").strip()
    path_prefix = data.get("path_prefix", "").strip()
    target_port = data.get("target_port")
    target_host = data.get("target_host", "localhost")
    auto_detected = data.get("auto_detected", False)

    if not name or not path_prefix or not target_port:
        return JSONResponse({"error": "name, path_prefix, target_port are required"}, status_code=400)

    try:
        target_port = int(target_port)
    except (TypeError, ValueError):
        return JSONResponse({"error": "target_port must be an integer"}, status_code=400)

    existing = db.list_services()
    for s in existing:
        if s["path_prefix"] == path_prefix:
            return JSONResponse({"error": f"path_prefix '{path_prefix}' already exists"}, status_code=409)

    svc_id = db.add_service(name, path_prefix, target_port, target_host, auto_detected)
    return JSONResponse({"id": svc_id})


@app.put("/api/services/{service_id}")
async def api_update_service(service_id: int, request: Request):
    data = await request.json()
    ok = db.update_service(service_id, **data)
    if not ok:
        return JSONResponse({"error": "service not found"}, status_code=404)
    return JSONResponse({"status": "updated"})


@app.delete("/api/services/{service_id}")
async def api_delete_service(service_id: int):
    svc = db.get_service(service_id)
    if not svc:
        return JSONResponse({"error": "not found"}, status_code=404)
    db.delete_service(service_id)
    return JSONResponse({"status": "deleted"})


@app.get("/api/services/scan")
async def api_scan():
    services = db.list_services()
    existing_ports = {s["target_port"] for s in services}
    detected = await scan_ports(exclude_ports=existing_ports | {config.port})
    return JSONResponse({"detected": detected})


def main():
    import uvicorn
    uvicorn.run(app, host=config.host, port=config.port)

if __name__ == "__main__":
    main()
```

---

### Task 6: Web UI templates

**Files:**
- Create: `templates/base.html`
- Create: `templates/dashboard.html`
- Create: `static/style.css`

- [x] **Step 1: Create `templates/base.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{% block title %}Proxy Manager{% endblock %}</title>
    <script src="https://unpkg.com/htmx.org@1.9.12"></script>
    <link rel="stylesheet" href="/static/style.css">
</head>
<body hx-headers='{"X-Requested-With": "XMLHttpRequest"}'>
    <header>
        <a href="/">Proxy Manager</a>
    </header>
    <div class="content" id="content">
        {% block content %}{% endblock %}
    </div>
</body>
</html>
```

- [x] **Step 2: Create `templates/dashboard.html`**

```html
{% extends "base.html" %}
{% block title %}Proxy Manager{% endblock %}
{% block content %}
<div class="header-row">
    <h1>服务管理</h1>
    <div class="header-actions">
        <button class="btn" hx-get="/api/services/scan" hx-target="#scan-results" hx-swap="innerHTML" hx-indicator="#scan-indicator">扫描服务</button>
        <button class="btn btn-outline" onclick="document.getElementById('add-form').classList.toggle('hidden')">添加服务</button>
    </div>
</div>

<div id="add-form" class="add-form hidden">
    <form hx-post="/api/services" hx-target="#service-list" hx-swap="outerHTML" hx-on::after-request="this.reset();document.getElementById('add-form').classList.add('hidden')">
        <div class="form-row">
            <input type="text" name="name" placeholder="名称" required>
            <input type="text" name="path_prefix" placeholder="路径前缀" required>
            <input type="number" name="target_port" placeholder="目标端口" required>
            <input type="text" name="target_host" value="localhost" placeholder="目标主机">
            <button type="submit" class="btn">保存</button>
            <button type="button" class="btn btn-outline" onclick="document.getElementById('add-form').classList.add('hidden')">取消</button>
        </div>
    </form>
</div>

<span id="scan-indicator" class="htmx-indicator">扫描中...</span>

<div id="scan-results"></div>

<h2>已托管服务</h2>
<div id="service-list" class="service-grid">
    {% if services %}
        {% for svc in services %}
        <div class="service-card" id="svc-{{ svc.id }}">
            <div class="svc-header">
                <span class="svc-status {{ 'enabled' if svc.enabled else 'disabled' }}"></span>
                <strong>{{ svc.name }}</strong>
                <span class="svc-badge {{ 'auto' if svc.auto_detected else 'manual' }}">
                    {{ '自动' if svc.auto_detected else '手动' }}
                </span>
            </div>
            <div class="svc-path">/<code>{{ svc.path_prefix }}</code></div>
            <div class="svc-target">{{ svc.target_host }}:{{ svc.target_port }}</div>
            <div class="svc-actions">
                <a href="/{{ svc.path_prefix }}" class="btn-sm" target="_blank">访问</a>
                <button class="btn-sm btn-danger" hx-delete="/api/services/{{ svc.id }}" hx-target="#svc-{{ svc.id }}" hx-swap="outerHTML" hx-confirm="删除 {{ svc.name }}？">删除</button>
            </div>
        </div>
        {% endfor %}
    {% else %}
        <p class="muted">暂无托管服务，点击"扫描服务"自动发现或手动添加</p>
    {% endif %}
</div>
{% endblock %}
```

- [x] **Step 3: Create `static/style.css`**

```css
:root {
  --bg: #ffffff;
  --bg-subtle: #f6f8fa;
  --text: #1f2a3a;
  --text-secondary: #5c6b7e;
  --text-muted: #8b95a5;
  --border: #e2e6ed;
  --accent: #2563eb;
  --green: #22c55e;
  --red: #ef4444;
  --orange: #f59e0b;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md: 0 2px 8px rgba(0,0,0,0.06);
  --radius: 8px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117;
    --bg-subtle: #161b22;
    --text: #e6edf3;
    --text-secondary: #8b949e;
    --text-muted: #6e7681;
    --border: #30363d;
    --accent: #58a6ff;
    --green: #22c55e;
    --red: #ef4444;
    --orange: #f59e0b;
  }
}

* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
}
header {
  background: var(--bg-subtle);
  border-bottom: 1px solid var(--border);
  padding: 0 24px;
  display: flex;
  align-items: center;
  height: 52px;
}
header a { color: var(--text); text-decoration: none; font-size: 16px; font-weight: 700; }
.content { padding: 32px 24px; max-width: 960px; margin: 0 auto; }
h1 { font-size: 1.5rem; }
h2 { font-size: 1.15rem; margin: 1.5em 0 0.75em; }

.header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5em; }
.header-actions { display: flex; gap: 8px; }

.hidden { display: none; }
.htmx-indicator { opacity: 0; transition: opacity 0.3s; font-size: 13px; color: var(--text-muted); }
.htmx-request .htmx-indicator { opacity: 1; }
.htmx-request.htmx-indicator { opacity: 1; }

.add-form { background: var(--bg-subtle); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin-bottom: 1em; }
.form-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.form-row input { flex: 1; min-width: 120px; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg); color: var(--text); font-size: 13px; }
.form-row input:focus { outline: none; border-color: var(--accent); }

.service-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
.service-card {
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  transition: all 0.2s;
}
.service-card:hover { border-color: var(--accent); box-shadow: var(--shadow-md); }
.svc-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.svc-status { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.svc-status.enabled { background: var(--green); }
.svc-status.disabled { background: var(--red); }
.svc-badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; margin-left: auto; }
.svc-badge.auto { background: var(--orange); color: #000; }
.svc-badge.manual { background: var(--accent); color: #fff; }
.svc-path { font-family: 'SFMono-Regular', Consolas, monospace; font-size: 13px; margin-bottom: 4px; }
.svc-path code { background: var(--bg); padding: 1px 6px; border-radius: 4px; }
.svc-target { font-size: 12px; color: var(--text-secondary); margin-bottom: 10px; }
.svc-actions { display: flex; gap: 6px; }
.btn {
  padding: 8px 16px; background: var(--accent); color: #fff; border: none;
  border-radius: var(--radius); font-size: 13px; font-weight: 600; cursor: pointer;
  white-space: nowrap; text-decoration: none; display: inline-block;
}
.btn:hover { opacity: 0.9; }
.btn-outline { background: transparent; color: var(--text); border: 1px solid var(--border); }
.btn-outline:hover { border-color: var(--accent); color: var(--accent); }
.btn-sm {
  padding: 4px 12px; background: var(--bg); color: var(--text-secondary);
  border: 1px solid var(--border); border-radius: var(--radius); font-size: 12px;
  cursor: pointer; text-decoration: none; display: inline-block;
}
.btn-sm:hover { border-color: var(--accent); color: var(--accent); }
.btn-danger { color: var(--red); }
.btn-danger:hover { border-color: var(--red); color: var(--red); }
.muted { color: var(--text-muted); font-style: italic; }

.scan-section { margin: 1em 0; }
.scan-card {
  display: flex; align-items: center; gap: 12px;
  background: var(--bg-subtle); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 12px 16px; margin-bottom: 6px;
}
.scan-port { font-family: monospace; font-weight: 600; min-width: 60px; }
.scan-name { flex: 1; }
.scan-server { font-size: 12px; color: var(--text-muted); }
```

---

### Task 7: Docker deployment

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`

- [x] **Step 1: Create `Dockerfile`**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt

COPY . .

RUN mkdir -p data

EXPOSE 8090

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8090"]
```

- [x] **Step 2: Create `docker-compose.yml`**

```yaml
services:
  proxy-manager:
    build: .
    network_mode: "host"
    volumes:
      - ./data:/app/data
      - ./config.yaml:/app/config.yaml
    restart: unless-stopped
```

- [x] **Step 3: Create `.dockerignore`**

```
__pycache__
*.pyc
.gitkeep
data/proxy-manager.db
```

---

### Task 8: Verify

- [x] **Step 1: Install dependencies and start server**

```bash
cd /home/ubuntu/ai/proxy-manager
pip install -r requirements.txt
python -c "from main import main; main()"
```

Verify:
- `curl http://localhost:8090/` returns dashboard HTML
- `curl http://localhost:8090/api/services` returns `{"services":[]}`
- `curl -X POST http://localhost:8090/api/services -H 'Content-Type: application/json' -d '{"name":"Test","path_prefix":"test","target_port":8090}'` adds service
- `curl http://localhost:8090/test` proxies to itself (loopback test)

- [x] **Step 2: Test auto-scan**
```bash
curl http://localhost:8090/api/services/scan
```
Expected: returns list of detected services running on local ports

- [x] **Step 3: Build Docker image**
```bash
docker build -t proxy-manager:latest .
docker run --rm --network=host -v $(pwd)/data:/app/data proxy-manager:latest
```
