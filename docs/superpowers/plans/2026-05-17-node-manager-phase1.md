# Node Manager Phase 1 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** Agent 能连接 Server 并上报系统指标，Web UI 可查看节点在线状态和实时指标

**架构:** Agent (Rust) 通过 WebSocket 连接 Server (Python FastAPI)，注册身份后定时上报 CPU/内存/磁盘/负载指标

**Tech Stack:** Rust (tokio + tokio-tungstenite + sysinfo), Python (FastAPI + uvicorn + SQLite + HTMX)

---

### Task 1: 项目脚手架 — Agent

**Files:**
- Create: `/home/ubuntu/ai/node-manager/agent/Cargo.toml`
- Create: `/home/ubuntu/ai/node-manager/agent/src/main.rs`

- [ ] **Step 1: 创建 Cargo.toml**

```toml
[package]
name = "node-agent"
version = "0.1.0"
edition = "2021"

[dependencies]
tokio = { version = "1", features = ["full"] }
tokio-tungstenite = { version = "0.24", features = ["native-tls"] }
futures-util = "0.3"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sysinfo = "0.32"
clap = { version = "4", features = ["derive"] }
tracing = "0.1"
tracing-subscriber = "0.3"
url = "2"
chrono = "0.4"
```

- [ ] **Step 2: 创建 main.rs — CLI 参数解析 + 配置加载**

```rust
use clap::Parser;
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "node-agent")]
struct Args {
    #[arg(short, long, default_value = "/etc/node-agent/config.toml")]
    config: PathBuf,

    #[arg(short, long)]
    server_url: Option<String>,

    #[arg(short, long)]
    node_id: Option<String>,

    #[arg(short, long)]
    token: Option<String>,
}

#[derive(serde::Deserialize)]
struct Config {
    server_url: String,
    node_id: String,
    token: String,
}

fn load_config(path: &Path, args: &Args) -> Config {
    let content = std::fs::read_to_string(path).unwrap_or_default();
    let mut cfg: Config = toml::from_str(&content).unwrap();
    if let Some(url) = &args.server_url {
        cfg.server_url = url.clone();
    }
    if let Some(id) = &args.node_id {
        cfg.node_id = id.clone();
    }
    if let Some(t) = &args.token {
        cfg.token = t.clone();
    }
    cfg
}
```

Note: Need to add `toml` to Cargo.toml dependencies: `toml = "0.8"`

- [ ] **Step 3: 实现 WebSocket 连接 + 注册 + 心跳**

在 main.rs 中添加:

```rust
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{info, error, warn};

struct Agent {
    config: Config,
    system: sysinfo::System,
}

impl Agent {
    async fn run(&mut self) {
        let ws_url = format!("{}/ws/agent", self.config.server_url.trim_end_matches('/'));
        loop {
            match connect_async(&ws_url).await {
                Ok((ws_stream, _)) => {
                    info!("Connected to server");
                    let (mut write, mut read) = ws_stream.split();

                    // Register
                    let register = serde_json::json!({
                        "type": "register",
                        "node_id": self.config.node_id,
                        "token": self.config.token,
                    });
                    if write.send(Message::Text(register.to_string())).await.is_err() {
                        continue;
                    }

                    let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));

                    loop {
                        tokio::select! {
                            _ = interval.tick() => {
                                // Send heartbeat
                                let ping = serde_json::json!({"type": "ping"});
                                if write.send(Message::Text(ping.to_string())).await.is_err() {
                                    break;
                                }
                            }
                            msg = read.next() => {
                                match msg {
                                    Some(Ok(Message::Text(text))) => {
                                        self.handle_message(&mut write, &text).await;
                                    }
                                    Some(Ok(Message::Close(_))) | None => {
                                        info!("Connection closed");
                                        break;
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    error!("Connection failed: {e}");
                    tokio::time::sleep(std::time::Duration::from_secs(10)).await;
                }
            }
        }
    }

    async fn handle_message(&mut self, write: &mut impl futures_util::SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error>, text: &str) {
        match serde_json::from_str::<serde_json::Value>(text) {
            Ok(msg) => {
                match msg["type"].as_str() {
                    Some("pong") => {}
                    Some("collect_metrics") => {
                        self.send_metrics(write).await;
                    }
                    _ => warn!("Unknown message type"),
                }
            }
            Err(e) => warn!("Invalid message: {e}"),
        }
    }
}
```

- [ ] **Step 4: 实现系统指标采集**

在 main.rs 中添加 Agent 方法:

```rust
use sysinfo::{System, Disks};

fn collect_metrics(sys: &mut sysinfo::System) -> serde_json::Value {
    sys.refresh_cpu();
    sys.refresh_memory();
    sys.refresh_disks();
    sys.refresh_networks();

    let cpu_pct = sys.global_cpu_info().cpu_usage();
    let memory_pct = sys.used_memory() as f64 / sys.total_memory() as f64 * 100.0;
    let memory_used_mb = sys.used_memory() as f64 / 1024.0 / 1024.0;

    let disks = Disks::new_with_refreshed_list();
    let disk_pct = disks.iter().map(|d| d.usage()).next().unwrap_or(0.0);
    let disk_used_gb = disks.iter().map(|d| d.total() - d.available()).next().unwrap_or(0) as f64 / 1024.0 / 1024.0 / 1024.0;

    let load = sys.load_average();

    serde_json::json!({
        "type": "metrics",
        "cpu_pct": cpu_pct,
        "memory_pct": memory_pct,
        "memory_used_mb": memory_used_mb,
        "disk_pct": disk_pct,
        "disk_used_gb": disk_used_gb,
        "load_1m": load.one,
        "load_5m": load.five,
        "load_15m": load.fifteen,
    })
}
```

- [ ] **Step 5: 组装 main 函数**

```rust
#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let args = Args::parse();
    let config = load_config(&args.config, &args);

    let mut agent = Agent {
        config,
        system: sysinfo::System::new(),
    };

    // Initial metrics warm-up
    agent.system.refresh_all();

    agent.run().await;
}
```

- [ ] **Step 6: 验证编译**

Run: `cargo check --manifest-path /home/ubuntu/ai/node-manager/agent/Cargo.toml`
Expected: 编译成功，无 error

### Task 2: 项目脚手架 — Server

**Files:**
- Create: `/home/ubuntu/ai/node-manager/server/main.py`
- Create: `/home/ubuntu/ai/node-manager/server/config.py`
- Create: `/home/ubuntu/ai/node-manager/server/database.py`
- Create: `/home/ubuntu/ai/node-manager/server/requirements.txt`

- [ ] **Step 1: 创建 requirements.txt**

```
fastapi>=0.110.0
uvicorn[standard]>=0.29.0
websockets>=12.0
pyyaml>=6.0
jinja2>=3.1
```

- [ ] **Step 2: 创建 config.py**

```python
from dataclasses import dataclass
from pathlib import Path
import yaml


@dataclass
class Config:
    host: str = "0.0.0.0"
    port: int = 8000
    db_path: str = "data/node-manager.db"


def load_config(path: str = "config.yaml") -> Config:
    path = Path(path)
    if not path.exists():
        return Config()
    with open(path) as f:
        data = yaml.safe_load(f)
    return Config(**data)
```

- [ ] **Step 3: 创建 database.py**

```python
from __future__ import annotations

import sqlite3
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class Database:
    def __init__(self, db_path: str):
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_db()

    def _init_db(self):
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS nodes (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                token TEXT UNIQUE NOT NULL,
                status TEXT DEFAULT 'offline',
                last_seen TIMESTAMP,
                os_info TEXT DEFAULT '{}',
                registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                node_id TEXT NOT NULL,
                ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                cpu_pct REAL,
                memory_pct REAL,
                memory_used_mb REAL,
                disk_pct REAL,
                disk_used_gb REAL,
                load_1m REAL,
                load_5m REAL,
                load_15m REAL
            );
            CREATE INDEX IF NOT EXISTS idx_metrics_node_ts ON metrics(node_id, ts);

            CREATE TABLE IF NOT EXISTS commands (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                node_id TEXT NOT NULL,
                cmd_type TEXT NOT NULL,
                cmd_content TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                result TEXT,
                exit_code INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                executed_at TIMESTAMP
            );
        """)
        self.conn.commit()

    def register_node(self, node_id: str, name: str, token: str) -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO nodes (id, name, token) VALUES (?, ?, ?)",
            (node_id, name, token),
        )
        self.conn.commit()

    def verify_node(self, node_id: str, token: str) -> bool:
        row = self.conn.execute(
            "SELECT 1 FROM nodes WHERE id = ? AND token = ?", (node_id, token)
        ).fetchone()
        return row is not None

    def set_node_online(self, node_id: str) -> None:
        self.conn.execute(
            "UPDATE nodes SET status = 'online', last_seen = ? WHERE id = ?",
            (datetime.now(timezone.utc).isoformat(), node_id),
        )
        self.conn.commit()

    def set_node_offline(self, node_id: str) -> None:
        self.conn.execute(
            "UPDATE nodes SET status = 'offline' WHERE id = ?", (node_id,)
        )
        self.conn.commit()

    def save_metrics(self, node_id: str, data: dict) -> None:
        self.conn.execute(
            """INSERT INTO metrics (node_id, cpu_pct, memory_pct, memory_used_mb,
               disk_pct, disk_used_gb, load_1m, load_5m, load_15m)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                node_id,
                data.get("cpu_pct"),
                data.get("memory_pct"),
                data.get("memory_used_mb"),
                data.get("disk_pct"),
                data.get("disk_used_gb"),
                data.get("load_1m"),
                data.get("load_5m"),
                data.get("load_15m"),
            ),
        )
        self.conn.commit()

    def get_nodes(self) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT id, name, status, last_seen FROM nodes ORDER BY name"
        ).fetchall()
        return [dict(r) for r in rows]

    def get_node(self, node_id: str) -> dict[str, Any] | None:
        row = self.conn.execute(
            "SELECT id, name, status, last_seen, os_info FROM nodes WHERE id = ?",
            (node_id,),
        ).fetchone()
        return dict(row) if row else None

    def get_latest_metrics(self, node_id: str) -> dict[str, Any] | None:
        row = self.conn.execute(
            "SELECT * FROM metrics WHERE node_id = ? ORDER BY ts DESC LIMIT 1",
            (node_id,),
        ).fetchone()
        return dict(row) if row else None

    def get_metrics_history(self, node_id: str, limit: int = 60) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT * FROM metrics WHERE node_id = ? ORDER BY ts DESC LIMIT ?",
            (node_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]
```

- [ ] **Step 4: 创建 main.py — FastAPI 入口 + WebSocket Handler**

```python
from __future__ import annotations

import asyncio
import json
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from jinja2 import Environment, FileSystemLoader

from config import load_config
from database import Database

config = load_config()
db = Database(config.db_path)
BASE_DIR = Path(__file__).parent

app = FastAPI(title="Node Manager")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

env = Environment(loader=FileSystemLoader(str(BASE_DIR / "templates")))

# Active WebSocket connections: node_id -> WebSocket
active_connections: dict[str, WebSocket] = {}


async def _remove_node(node_id: str):
    if node_id in active_connections:
        del active_connections[node_id]
    db.set_node_offline(node_id)


@app.websocket("/ws/agent")
async def agent_websocket(ws: WebSocket):
    await ws.accept()
    node_id = None
    try:
        data = await ws.receive_json()
        if data.get("type") != "register":
            await ws.close(code=4000)
            return

        if not db.verify_node(data["node_id"], data["token"]):
            await ws.close(code=4001)
            return

        node_id = data["node_id"]
        active_connections[node_id] = ws
        db.set_node_online(node_id)

        while True:
            data = await ws.receive_json()
            match data.get("type"):
                case "ping":
                    await ws.send_json({"type": "pong"})
                case "metrics":
                    db.save_metrics(node_id, data)
                case "cmd_result":
                    db.conn.execute(
                        "UPDATE commands SET status = ?, result = ?, exit_code = ?, executed_at = ? WHERE id = ?",
                        ("success" if data.get("exit_code") == 0 else "failed",
                         data.get("stdout", "") + data.get("stderr", ""),
                         data.get("exit_code"),
                         datetime.now(timezone.utc).isoformat(),
                         data["cmd_id"]),
                    )
                    db.conn.commit()
    except (WebSocketDisconnect, json.JSONDecodeError):
        pass
    finally:
        if node_id:
            await _remove_node(node_id)


async def check_stale_connections():
    while True:
        await asyncio.sleep(60)
        now = datetime.now(timezone.utc)
        stale = []
        for nid, ws in active_connections.items():
            try:
                await ws.send_json({"type": "ping"})
            except Exception:
                stale.append(nid)
        for nid in stale:
            await _remove_node(nid)


@app.on_event("startup")
async def startup():
    asyncio.create_task(check_stale_connections())


@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    nodes = db.get_nodes()
    for n in nodes:
        metrics = db.get_latest_metrics(n["id"])
        if metrics:
            n["cpu_pct"] = round(metrics["cpu_pct"], 1) if metrics["cpu_pct"] else None
            n["memory_pct"] = round(metrics["memory_pct"], 1) if metrics["memory_pct"] else None
            n["disk_pct"] = round(metrics["disk_pct"], 1) if metrics["disk_pct"] else None
    template = env.get_template("dashboard.html")
    return template.render(nodes=nodes)


@app.get("/nodes/{node_id}", response_class=HTMLResponse)
async def node_detail(node_id: str):
    node = db.get_node(node_id)
    if not node:
        return HTMLResponse("Node not found", status_code=404)
    latest = db.get_latest_metrics(node_id)
    history = db.get_metrics_history(node_id, limit=60)
    template = env.get_template("node_detail.html")
    return template.render(node=node, latest=latest, history=history)


@app.get("/api/nodes")
async def api_nodes():
    return db.get_nodes()


def main():
    import uvicorn
    uvicorn.run("main:app", host=config.host, port=config.port)


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: 创建 Server 配置 config.yaml**

```yaml
host: 0.0.0.0
port: 8000
db_path: data/node-manager.db
```

- [ ] **Step 6: 创建 Server 启动脚本 seed.py（添加测试节点 + 生成 Token）**

```python
import secrets
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from database import Database
from config import load_config

config = load_config()
db = Database(config.db_path)

# 添加测试节点
nodes = [
    ("node-1", "Web Server"),
    ("node-2", "Database"),
    ("node-3", "Dev Server"),
]

for nid, name in nodes:
    token = secrets.token_hex(16)
    db.register_node(nid, name, token)
    print(f"Node: {nid} ({name})")
    print(f"  Token: {token}")
    print(f"  Agent config:")
    print(f"    server_url = \"ws://<SERVER_IP>:8000\"")
    print(f"    node_id = \"{nid}\"")
    print(f"    token = \"{token}\"")
    print()
```

### Task 3: Web UI 模板

**Files:**
- Create: `/home/ubuntu/ai/node-manager/server/templates/base.html`
- Create: `/home/ubuntu/ai/node-manager/server/templates/dashboard.html`
- Create: `/home/ubuntu/ai/node-manager/server/templates/node_detail.html`
- Create: `/home/ubuntu/ai/node-manager/server/static/style.css`
- Create: `/home/ubuntu/ai/node-manager/server/static/.gitkeep`

- [ ] **Step 1: 创建 base.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{% block title %}Node Manager{% endblock %}</title>
    <script src="https://unpkg.com/htmx.org@1.9.12"></script>
    <link rel="stylesheet" href="/static/style.css">
</head>
<body>
    <header>
        <a href="/">Node Manager</a>
    </header>
    <div class="layout">
        <main class="content">
            {% block content %}{% endblock %}
        </main>
    </div>
</body>
</html>
```

- [ ] **Step 2: 创建 dashboard.html**

```html
{% extends "base.html" %}
{% block title %}Node Manager{% endblock %}
{% block content %}
<h1>节点状态</h1>
<div class="node-grid">
    {% for node in nodes %}
    <div class="node-card {{ 'online' if node.status == 'online' else 'offline' }}"
         hx-get="/nodes/{{ node.id }}" hx-target="#content" hx-push-url="true">
        <div class="node-header">
            <span class="status-dot {{ node.status }}"></span>
            <strong>{{ node.name }}</strong>
            <span class="node-id">{{ node.id }}</span>
        </div>
        {% if node.cpu_pct is not none %}
        <div class="metrics-row">
            <span class="metric">CPU {{ node.cpu_pct }}%</span>
            <span class="metric">MEM {{ node.memory_pct }}%</span>
            <span class="metric">DISK {{ node.disk_pct }}%</span>
        </div>
        {% else %}
        <div class="metrics-row muted">暂无数据</div>
        {% endif %}
    </div>
    {% endfor %}
</div>
{% endblock %}
```

- [ ] **Step 3: 创建 node_detail.html**

```html
{% extends "base.html" %}
{% block title %}{{ node.name }} - Node Manager{% endblock %}
{% block content %}
<div class="breadcrumb">
    <a href="/" hx-get="/" hx-target="#content" hx-push-url="true">← 返回</a>
</div>
<h1>{{ node.name }} <span class="node-id">{{ node.id }}</span></h1>
<div class="status-bar">
    <span class="status-dot {{ node.status }}"></span>
    {{ '在线' if node.status == 'online' else '离线' }}
    {% if node.last_seen %} | 最后上报: {{ node.last_seen }}{% endif %}
</div>

{% if latest %}
<div class="metrics-grid">
    <div class="metric-card">
        <div class="metric-label">CPU</div>
        <div class="metric-value">{{ '%.1f'|format(latest.cpu_pct) }}%</div>
    </div>
    <div class="metric-card">
        <div class="metric-label">内存</div>
        <div class="metric-value">{{ '%.1f'|format(latest.memory_pct) }}%</div>
        <div class="metric-sub">{{ '%.0f'|format(latest.memory_used_mb) }} MB</div>
    </div>
    <div class="metric-card">
        <div class="metric-label">磁盘</div>
        <div class="metric-value">{{ '%.1f'|format(latest.disk_pct) }}%</div>
        <div class="metric-sub">{{ '%.1f'|format(latest.disk_used_gb) }} GB</div>
    </div>
    <div class="metric-card">
        <div class="metric-label">负载</div>
        <div class="metric-value">{{ '%.2f'|format(latest.load_1m) }}</div>
        <div class="metric-sub">1min / 5min / 15min</div>
    </div>
</div>

<h2>历史指标</h2>
<table>
    <thead>
        <tr>
            <th>时间</th>
            <th>CPU</th>
            <th>内存</th>
            <th>磁盘</th>
            <th>负载</th>
        </tr>
    </thead>
    <tbody>
    {% for m in history %}
        <tr>
            <td>{{ m.ts }}</td>
            <td>{{ '%.1f'|format(m.cpu_pct) }}%</td>
            <td>{{ '%.1f'|format(m.memory_pct) }}%</td>
            <td>{{ '%.1f'|format(m.disk_pct) }}%</td>
            <td>{{ '%.2f'|format(m.load_1m) }}</td>
        </tr>
    {% endfor %}
    </tbody>
</table>
{% endif %}
{% endblock %}
```

- [ ] **Step 4: 创建 style.css**

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
  --transition: 0.2s ease;
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
header a {
  color: var(--text);
  text-decoration: none;
  font-size: 16px;
  font-weight: 700;
}
.content { padding: 32px 24px; max-width: 960px; margin: 0 auto; }
h1 { font-size: 1.5rem; margin-bottom: 1em; }

/* Node grid */
.node-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.node-card {
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all var(--transition);
}
.node-card:hover { border-color: var(--accent); box-shadow: var(--shadow-md); }
.node-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.node-id { font-size: 12px; color: var(--text-muted); margin-left: auto; }
.status-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.status-dot.online { background: var(--green); }
.status-dot.offline { background: var(--red); }
.metrics-row { display: flex; gap: 12px; font-size: 13px; color: var(--text-secondary); }
.metrics-row.muted { color: var(--text-muted); font-style: italic; }

/* Node detail */
.breadcrumb { margin-bottom: 1em; }
.breadcrumb a { color: var(--accent); text-decoration: none; font-size: 14px; }
.status-bar { font-size: 14px; color: var(--text-secondary); margin-bottom: 1.5em; display: flex; align-items: center; gap: 6px; }
.metrics-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); margin-bottom: 2em; }
.metric-card { background: var(--bg-subtle); border: 1px solid var(--border); border-radius: 8px; padding: 16px; text-align: center; }
.metric-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; }
.metric-value { font-size: 1.5rem; font-weight: 700; }
.metric-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

/* Table */
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; }
th { background: var(--bg-subtle); font-weight: 600; }
tr:nth-child(even) { background: var(--bg-subtle); }
```

### Task 4: 端到端验证

- [ ] **Step 1: 安装 Server 依赖并启动**

```bash
cd /home/ubuntu/ai/node-manager/server
pip install -r requirements.txt
```

- [ ] **Step 2: 初始化节点并启动 Server**

```bash
cd /home/ubuntu/ai/node-manager/server
python seed.py
# 记录输出的 Token

python main.py
```

Expected: Server 启动在 http://0.0.0.0:8000，Web UI 可查看 3 个离线节点

- [ ] **Step 3: 创建 Agent 配置并启动 Agent**

创建 `/etc/node-agent/config.toml`（或任意路径）:
```toml
server_url = "ws://127.0.0.1:8000"
node_id = "node-1"
token = "<从 seed.py 获取的 token>"
```

```bash
cd /home/ubuntu/ai/node-manager/agent
cargo run -- -c /path/to/config.toml
```

Expected: Agent 连接成功，Server 日志显示节点上线

- [ ] **Step 4: 验证 Web UI**

打开 http://localhost:8000
Expected: node-1 显示为在线状态，点击进入详情页可查看实时指标和历史数据

- [ ] **Step 5: 停止清理**

```bash
# Ctrl+C 停止 Agent 和 Server
```
