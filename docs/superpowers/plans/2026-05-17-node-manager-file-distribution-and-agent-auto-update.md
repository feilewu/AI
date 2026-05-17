# Node Manager — 文件下发与 Agent 自动更新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add file distribution API to Server and self-update capability to Agent.

**Architecture:** Server stores agent release binaries with versioning, pushes `update_available` via WebSocket. Agent downloads new binary via HTTP, verifies SHA256, replaces itself via rename, and exits for systemd restart.

**Tech Stack:** Python FastAPI + SQLite (Server), Rust tokio + reqwest + tokio-tungstenite (Agent)

---

### Task 1: Server — 数据库 migration 与 config 扩展

**Files:**
- Modify: `node-manager/server/database.py:17-65`
- Modify: `node-manager/server/config.py`
- Modify: `node-manager/server/config.yaml`

- [ ] **Step 1: config.yaml 增加 releases_dir**

```yaml
host: 0.0.0.0
port: 8902
db_path: data/node-manager.db
releases_dir: data/releases
```

- [ ] **Step 2: config.py 加载新字段**

```python
config = load_config()
RELEASES_DIR = Path(BASE_DIR / config.get("releases_dir", "data/releases"))
```

确保 `config.py` 读取并暴露 `releases_dir`。

- [ ] **Step 3: database.py — 新增 releases 表**

在 `_create_tables()` 的 `executescript` 末尾追加：

```sql
CREATE TABLE IF NOT EXISTS releases (
    version TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    checksum_sha256 TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

- [ ] **Step 4: database.py — _migrate() 添加 agent_version 列**

在 `_migrate()` 中：

```python
existing_cols = [r[1] for r in self.conn.execute("PRAGMA table_info(nodes)").fetchall()]
if "agent_version" not in existing_cols:
    self.conn.execute("ALTER TABLE nodes ADD COLUMN agent_version TEXT DEFAULT ''")
```

- [ ] **Step 5: database.py — Release CRUD 方法**

```python
def save_release(self, version: str, file_path: str, file_size: int, checksum_sha256: str):
    self.conn.execute(
        "INSERT OR REPLACE INTO releases (version, file_path, file_size, checksum_sha256) VALUES (?, ?, ?, ?)",
        (version, file_path, file_size, checksum_sha256),
    )
    self.conn.commit()

def get_release(self, version: str) -> dict | None:
    row = self.conn.execute("SELECT * FROM releases WHERE version = ?", (version,)).fetchone()
    return dict(row) if row else None

def get_latest_release(self) -> dict | None:
    row = self.conn.execute("SELECT * FROM releases ORDER BY created_at DESC LIMIT 1").fetchone()
    return dict(row) if row else None

def get_releases(self) -> list:
    rows = self.conn.execute("SELECT * FROM releases ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]

def update_agent_version(self, node_id: str, agent_version: str):
    self.conn.execute("UPDATE nodes SET agent_version = ? WHERE id = ?", (agent_version, node_id))
    self.conn.commit()
```

- [ ] **Step 6: 验证 Server 启动**

```bash
cd /home/ubuntu/ai/node-manager/server && python -c "from config import load_config; from database import Database; db = Database('data/test.db'); print('ok')"
```

Expected: prints "ok"

- [ ] **Step 7: Commit**

```bash
git add node-manager/server/config.yaml node-manager/server/config.py node-manager/server/database.py
git commit -m "node-manager: server数据库新增releases表和agent_version字段"
```

---

### Task 2: Server — Release 管理 API

**Files:**
- Modify: `node-manager/server/main.py`
- Modify: `node-manager/server/database.py` (already done in Task 1)

- [ ] **Step 1: main.py 顶部导入新增**

```python
import hashlib
from pathlib import Path
from fastapi.responses import FileResponse
```

- [ ] **Step 2: 添加 broadcast_update 和版本比较工具函数**

```python
async def broadcast_update(release: dict):
    msg = json.dumps({
        "type": "update_available",
        "version": release["version"],
        "download_url": f"/api/releases/{release['version']}/download",
        "checksum_sha256": release["checksum_sha256"],
        "file_size": release["file_size"],
    })
    for nid, ws in list(active_connections.items()):
        try:
            await ws.send_text(msg)
        except Exception:
            pass


def _should_update(latest_ver: str, current_ver: str) -> bool:
    def as_tuple(v: str) -> tuple:
        parts = v.strip().split(".")
        return tuple(int(p) for p in parts[:3])
    try:
        return as_tuple(latest_ver) > as_tuple(current_ver)
    except (ValueError, IndexError):
        return False
```

- [ ] **Step 3: 上传 API — POST /api/releases**

```python
RELEASES_DIR = Path(config.get("releases_dir", "data/releases"))

@app.post("/api/releases")
async def api_upload_release(request: Request):
    form = await request.form()
    version = form.get("version", "").strip()
    if not version:
        return JSONResponse({"error": "version is required"}, status_code=400)

    upload_file = form.get("file")
    if not upload_file:
        return JSONResponse({"error": "file is required"}, status_code=400)

    release_dir = RELEASES_DIR / version
    release_dir.mkdir(parents=True, exist_ok=True)
    file_path = release_dir / "node-agent"

    content = await upload_file.read()
    file_path.write_bytes(content)

    checksum = hashlib.sha256(content).hexdigest()
    file_size = len(content)

    db.save_release(version, str(file_path), file_size, checksum)

    asyncio.create_task(broadcast_update({
        "version": version,
        "checksum_sha256": checksum,
        "file_size": file_size,
    }))

    return JSONResponse({"version": version, "file_size": file_size, "checksum_sha256": checksum})
```

- [ ] **Step 4: 版本列表 API — GET /api/releases**

```python
@app.get("/api/releases")
async def api_list_releases():
    releases = db.get_releases()
    return JSONResponse({"releases": releases})
```

- [ ] **Step 5: 最新版本 API — GET /api/releases/latest**

```python
@app.get("/api/releases/latest")
async def api_latest_release():
    release = db.get_latest_release()
    if not release:
        return JSONResponse({"error": "no releases found"}, status_code=404)
    return JSONResponse({"release": release})
```

- [ ] **Step 6: 下载 API — GET /api/releases/{version}/download**

```python
@app.get("/api/releases/{version}/download")
async def api_download_release(version: str):
    release = db.get_release(version)
    if not release:
        return JSONResponse({"error": "version not found"}, status_code=404)
    file_path = Path(release["file_path"])
    if not file_path.exists():
        return JSONResponse({"error": "file not found"}, status_code=404)
    return FileResponse(
        str(file_path),
        media_type="application/octet-stream",
        filename=f"node-agent-{version}",
    )
```

- [ ] **Step 7: 验证 API**

```bash
cd /home/ubuntu/ai/node-manager/server && python -c "
from main import app
print('API routes:')
for r in app.routes:
    if hasattr(r, 'methods') and hasattr(r, 'path'):
        print(f'  {r.methods} {r.path}')
"
```

Expected output should include `POST /api/releases`, `GET /api/releases`, `GET /api/releases/latest`, `GET /api/releases/{version}/download`.

- [ ] **Step 8: Commit**

```bash
git add node-manager/server/main.py
git commit -m "node-manager: server端Release管理API (上传/列表/最新/下载)"
```

---

### Task 3: Server — WebSocket 扩展（推送更新 + 版本检测）

**Files:**
- Modify: `node-manager/server/main.py`

- [ ] **Step 1: Agent 注册时检测版本并推送更新**

在 `agent_websocket` 中，注册成功后的位置追加：

```python
        active_connections[node_id] = ws
        db.set_node_online(node_id)
        await ws.send_json({"type": "registered", "node_id": node_id})

        # ── 版本检测 ──────────────────────────────
        agent_version = data.get("agent_version", "")
        if agent_version:
            db.update_agent_version(node_id, agent_version)
            latest = db.get_latest_release()
            if latest and _should_update(latest["version"], agent_version):
                await ws.send_json({
                    "type": "update_available",
                    "version": latest["version"],
                    "download_url": f"/api/releases/{latest['version']}/download",
                    "checksum_sha256": latest["checksum_sha256"],
                    "file_size": latest["file_size"],
                })
```

- [ ] **Step 2: 处理 Agent 的 update_status 消息**

在 WebSocket 消息循环中添加：

```python
            elif msg_type == "update_status":
                logger.info("Node %s update status: %s", node_id, msg.get("status"))
```

- [ ] **Step 3: 验证**

```bash
cd /home/ubuntu/ai/node-manager && docker compose build --no-cache && docker compose up -d
```

Server 应正常启动，WebSocket 连接不受影响。

- [ ] **Step 4: Commit**

```bash
git add node-manager/server/main.py
git commit -m "node-manager: server端WebSocket推送更新通知+注册时版本检测"
```

---

### Task 4: Agent — 版本注入 + Register 上报版本

**Files:**
- Modify: `node-manager/agent/Cargo.toml`
- Modify: `node-manager/agent/src/main.rs`

- [ ] **Step 1: Cargo.toml 确认版本号 + 添加 reqwest 依赖**

```toml
[package]
name = "node-agent"
version = "1.0.0"
edition = "2021"

[dependencies]
tokio = { version = "1", features = ["full"] }
tokio-tungstenite = { version = "0.24", features = ["__rustls-tls"] }
futures-util = "0.3"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sysinfo = "0.33"
clap = { version = "4", features = ["derive"] }
tracing = "0.1"
tracing-subscriber = "0.3"
reqwest = { version = "0.12", features = ["rustls-tls"], default-features = false }
sha2 = "0.10"
```

- [ ] **Step 2: Args 结构体增加 --version 参数**

```rust
#[derive(Parser, Debug)]
#[command(name = "node-agent", version = env!("CARGO_PKG_VERSION"))]
struct Args {
    #[arg(long)]
    config: Option<String>,

    #[arg(long)]
    server_url: Option<String>,

    #[arg(long)]
    node_id: Option<String>,

    #[arg(long)]
    token: Option<String>,
}
```

`clap` 的 `version` 属性会自动从 `CARGO_PKG_VERSION` 读取并生成 `--version` 标志。

- [ ] **Step 3: Register 消息增加 agent_version**

在 `run_loop` 中，注册消息改为：

```rust
let register = serde_json::json!({
    "type": "register",
    "node_id": node_id,
    "token": token,
    "agent_version": env!("CARGO_PKG_VERSION"),
});
```

- [ ] **Step 4: 编译验证**

```bash
cd /home/ubuntu/ai/node-manager/agent && RUSTFLAGS="-C target-feature=+crt-static" cargo build --release --target x86_64-unknown-linux-gnu 2>&1 | tail -5
```

Expected: Binary compiles without errors.

- [ ] **Step 5: 验证 --version**

```bash
./target/x86_64-unknown-linux-gnu/release/node-agent --version
```

Expected: `node-agent 1.0.0`

- [ ] **Step 6: Commit**

```bash
git add node-manager/agent/Cargo.toml node-manager/agent/src/main.rs node-manager/agent/Cargo.lock
git commit -m "node-manager: agent版本注入+register上报版本号+reqwest依赖"
```

---

### Task 5: Agent — 更新处理逻辑（下载 + 校验 + 替换 + 重启）

**Files:**
- Modify: `node-manager/agent/src/main.rs`

- [ ] **Step 1: 在 Agent 中新增 update_available 处理分支**

在 `run_loop` 的 `match parsed["type"].as_str()` 中新增：

```rust
Some("update_available") => {
    let version = parsed["version"].as_str().unwrap_or("unknown");
    let download_url = parsed["download_url"].as_str().unwrap_or("");
    let expected_checksum = parsed["checksum_sha256"].as_str().unwrap_or("");
    let _file_size = parsed["file_size"].as_i64().unwrap_or(0);

    info!("Update available: version={}, url={}", version, download_url);

    // 回复状态：downloading
    {
        let mut sink = ws_sink.lock().await;
        let status_msg = serde_json::json!({
            "type": "update_status",
            "version": version,
            "status": "downloading",
            "message": "",
        });
        sink.send(Message::Text(status_msg.to_string())).await?;
    }

    // 构造完整下载 URL
    let base_url = server_url.trim_end_matches('/').to_string();
    let full_url = format!("{}{}", base_url, download_url);

    // 下载新二进制
    match Self::download_binary(&full_url).await {
        Ok(downloaded_path) => {
            // SHA256 校验
            if !expected_checksum.is_empty() {
                match Self::verify_checksum(&downloaded_path, expected_checksum).await {
                    Ok(true) => {}
                    Ok(false) => {
                        let _ = std::fs::remove_file(&downloaded_path);
                        let mut sink = ws_sink.lock().await;
                        let status_msg = serde_json::json!({
                            "type": "update_status",
                            "version": version,
                            "status": "failed",
                            "message": "checksum mismatch",
                        });
                        sink.send(Message::Text(status_msg.to_string())).await?;
                        continue;
                    }
                    Err(e) => {
                        let _ = std::fs::remove_file(&downloaded_path);
                        let mut sink = ws_sink.lock().await;
                        let status_msg = serde_json::json!({
                            "type": "update_status",
                            "version": version,
                            "status": "failed",
                            "message": format!("checksum error: {}", e),
                        });
                        sink.send(Message::Text(status_msg.to_string())).await?;
                        continue;
                    }
                }
            }

            // 回复状态：ready
            {
                let mut sink = ws_sink.lock().await;
                let status_msg = serde_json::json!({
                    "type": "update_status",
                    "version": version,
                    "status": "ready",
                    "message": "",
                });
                sink.send(Message::Text(status_msg.to_string())).await?;
            }

            // 替换二进制并重启
            info!("Replacing binary and restarting...");
            match Self::replace_self(&downloaded_path).await {
                Ok(()) => {
                    // 回复成功状态，然后退出
                    {
                        let mut sink = ws_sink.lock().await;
                        let status_msg = serde_json::json!({
                            "type": "update_status",
                            "version": version,
                            "status": "success",
                            "message": "",
                        });
                        sink.send(Message::Text(status_msg.to_string())).await?;
                    }
                    // 短暂延迟确保消息发送
                    tokio::time::sleep(Duration::from_millis(200)).await;
                    std::process::exit(0);
                }
                Err(e) => {
                    let _ = std::fs::remove_file(&downloaded_path);
                    let mut sink = ws_sink.lock().await;
                    let status_msg = serde_json::json!({
                        "type": "update_status",
                        "version": version,
                        "status": "failed",
                        "message": format!("replace error: {}", e),
                    });
                    sink.send(Message::Text(status_msg.to_string())).await?;
                }
            }
        }
        Err(e) => {
            let mut sink = ws_sink.lock().await;
            let status_msg = serde_json::json!({
                "type": "update_status",
                "version": version,
                "status": "failed",
                "message": format!("download error: {}", e),
            });
            sink.send(Message::Text(status_msg.to_string())).await?;
        }
    }
}
```

- [ ] **Step 2: 实现 download_binary 方法**

```rust
async fn download_binary(url: &str) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()?;

    let response = client.get(url).send().await?;
    let bytes = response.bytes().await?;

    let dest = PathBuf::from("/tmp/node-agent-update");
    tokio::fs::write(&dest, &bytes).await?;

    // 设置可执行权限
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        tokio::fs::set_permissions(&dest, std::fs::Permissions::from_mode(0o755)).await?;
    }

    info!("Downloaded {} bytes to {:?}", bytes.len(), dest);
    Ok(dest)
}
```

- [ ] **Step 3: 实现 verify_checksum 方法**

```rust
use sha2::{Sha256, Digest};

async fn verify_checksum(path: &Path, expected: &str) -> Result<bool, Box<dyn std::error::Error>> {
    let content = tokio::fs::read(path).await?;
    let mut hasher = Sha256::new();
    hasher.update(&content);
    let actual = format!("{:x}", hasher.finalize());
    Ok(actual == expected)
}
```

- [ ] **Step 4: 实现 replace_self 方法**

```rust
async fn replace_self(new_bin: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let current_exe = std::env::current_exe()?;
    let backup = current_exe.with_extension("old");

    // 清理上次残留
    if backup.exists() {
        std::fs::remove_file(&backup)?;
    }

    // 当前二进制 → .old
    std::fs::rename(&current_exe, &backup)?;

    // 新二进制 → 当前位置
    std::fs::rename(new_bin, &current_exe)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&current_exe, std::fs::Permissions::from_mode(0o755))?;
    }

    info!("Binary replaced: {} → {}", backup.display(), current_exe.display());
    Ok(())
}
```

同时需要将 `download_binary`、`verify_checksum`、`replace_self` 定义为 `Agent` 的关联函数（`impl Agent` 块中）。

- [ ] **Step 5: 编译验证**

```bash
cd /home/ubuntu/ai/node-manager/agent && RUSTFLAGS="-C target-feature=+crt-static" cargo build --release --target x86_64-unknown-linux-gnu 2>&1 | tail -5
```

Expected: Compiles without errors.

- [ ] **Step 6: Commit**

```bash
git add node-manager/agent/src/main.rs node-manager/agent/Cargo.lock
git commit -m "node-manager: agent自动更新逻辑(下载/校验/替换/重启)"
```

---

### Task 6: Web UI — 版本管理与更新操作界面

**Files:**
- Modify: `node-manager/server/templates/manage.html`
- Modify: `node-manager/server/templates/node_detail.html`
- Modify: `node-manager/server/main.py`

- [ ] **Step 1: manage.html 增加 Release 上传区域**

在 "已有节点" 表格之前添加：

```html
<h2>Agent 版本管理</h2>
<form class="manage-form" hx-post="/api/releases" hx-target="#release-result" hx-swap="innerHTML" hx-encoding="multipart/form-data">
    <div class="form-row">
        <label>版本号</label>
        <input type="text" name="version" class="cmd-input" placeholder="如: 1.0.0" required style="flex:1;">
    </div>
    <div class="form-row">
        <label>二进制文件</label>
        <input type="file" name="file" class="cmd-input" required style="flex:1;">
    </div>
    <button type="submit" class="btn">上传</button>
</form>
<div id="release-result"></div>
<div hx-get="/api/releases" hx-trigger="load" hx-target="#release-list" hx-swap="innerHTML">
    <span class="muted">加载版本列表中...</span>
</div>
<div id="release-list"></div>
```

- [ ] **Step 2: node_detail.html 增加版本信息显示**

在 `status-bar` 行追加版本信息：

```html
{% if node.agent_version %}
    | Agent 版本: {{ node.agent_version }}
{% endif %}
```

- [ ] **Step 3: main.py 增加节点升级 API（Web UI 触发）**

```python
@app.post("/api/nodes/{node_id}/upgrade")
async def api_upgrade_node(node_id: str):
    ws = active_connections.get(node_id)
    if not ws:
        return JSONResponse({"error": "节点离线"}, status_code=400)
    latest = db.get_latest_release()
    if not latest:
        return JSONResponse({"error": "没有可用的 release"}, status_code=400)
    try:
        msg = json.dumps({
            "type": "update_available",
            "version": latest["version"],
            "download_url": f"/api/releases/{latest['version']}/download",
            "checksum_sha256": latest["checksum_sha256"],
            "file_size": latest["file_size"],
        })
        await ws.send_text(msg)
        return JSONResponse({"status": "update dispatched", "version": latest["version"]})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
```

- [ ] **Step 4: node_detail.html 增加"立即更新"按钮**

在状态栏附近添加：

```html
{% if node.status == 'online' and node.agent_version %}
    <button class="btn-sm" hx-post="/api/nodes/{{ node.id }}/upgrade" hx-target="#upgrade-result" hx-swap="innerHTML">立即更新</button>
    <span id="upgrade-result"></span>
{% endif %}
```

- [ ] **Step 5: manage.html Release 列表渲染**

添加 release 列表渲染。在 manage 页面中：

```html
<div id="release-list">
    <h3>已上传版本</h3>
    {% if releases %}
    <table>
        <thead>
            <tr>
                <th>版本</th>
                <th>大小</th>
                <th>SHA256</th>
                <th>上传时间</th>
            </tr>
        </thead>
        <tbody>
        {% for r in releases %}
            <tr>
                <td>{{ r.version }}</td>
                <td>{{ '{:.1f}'.format(r.file_size / 1024 / 1024) }} MB</td>
                <td><code style="font-size:11px">{{ r.checksum_sha256[:16] }}...</code></td>
                <td>{{ r.created_at }}</td>
            </tr>
        {% endfor %}
        </tbody>
    </table>
    {% else %}
    <p class="muted">暂无版本</p>
    {% endif %}
</div>
```

并在 manage 路由中传入 releases：

```python
@app.get("/manage", response_class=HTMLResponse)
async def manage_page(request: Request):
    nodes = db.get_nodes()
    releases = db.get_releases()
    return render_page("manage.html", request=request, title="节点管理 - Node Manager", nodes=nodes, releases=releases)
```

- [ ] **Step 6: 验证 UI**

```bash
cd /home/ubuntu/ai/node-manager && docker compose build --no-cache && docker compose up -d
```

浏览器打开 `http://localhost:8902/manage`，确认能看到 Release 上传表单。

- [ ] **Step 7: Commit**

```bash
git add node-manager/server/main.py node-manager/server/templates/manage.html node-manager/server/templates/node_detail.html
git commit -m "node-manager: Web UI版本管理和更新操作界面"
```

---

### Task 7: 构建脚本 — 添加上传步骤

**Files:**
- Modify: `node-manager/build.sh`

- [ ] **Step 1: build.sh 在打包后增加上传步骤**

在打包步骤之后、`info "部署包: ..."` 之前插入：

```bash
# ── 5. 上传 Agent 到 Server ────────────────────────
echo ">>> 上传 Agent 到 Server ..."
SERVER_URL="${SERVER_URL:-http://localhost:8902}"
VERSION=$(grep '^version =' "$SCRIPT_DIR/agent/Cargo.toml" | head -1 | sed 's/.*"\(.*\)".*/\1/')
if [ -n "$VERSION" ] && [ -f "$AGENT_BIN" ]; then
    curl -sf -X POST "$SERVER_URL/api/releases" \
        -F "version=$VERSION" \
        -F "file=@$AGENT_BIN" \
    && info "Agent v$VERSION 已上传到 $SERVER_URL" \
    || warn "上传失败 (Server 可能未运行)"
else
    warn "跳过上传：版本号或二进制不可用"
fi
```

- [ ] **Step 2: 验证脚本**

```bash
cd /home/ubuntu/ai/node-manager && bash build.sh 2>&1 | tail -20
```

Expected: 编译成功、Docker 正常构建/启动、打包完成、上传成功。

- [ ] **Step 3: Commit**

```bash
git add node-manager/build.sh
git commit -m "node-manager: build.sh增加上传Agent到Server步骤"
```
