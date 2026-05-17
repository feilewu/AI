# Node Manager — 文件下发与 Agent 自动更新

## 概述

为 Node Manager 增加文件下发能力：Server 提供 Release 管理 API，Agent 支持通过 WebSocket 推送自动更新自身二进制。构建流程与更新流程打通，实现"构建 → 上传 → 推送更新 → 节点自动升级"的完整链路。

## 约束

| 项目 | 要求 |
|------|------|
| 节点规模 | < 10 台 |
| 更新触发 | Server 通过 WebSocket 推送通知 |
| 版本管理 | 多版本，语义版本号 |
| 更新方式 | Agent 下载新二进制 → 替换 → systemd 重启 |
| 回滚 | 保留旧二进制，SSH 手动回滚 |
| 兼容性 | 旧 Agent（不带更新功能）不应受影响 |

## 架构

```
build.sh → RUSTFLAGS 编译 Agent
    │
    ▼
curl -X POST /api/releases  (上传二进制 + 版本号)
    │
    ▼
Server 存储到 data/releases/{version}/node-agent
    │
    ▼ 记录到 releases 表 + 推送 WebSocket 消息
    │
    ├─→ Agent A: 收到 update_available
    ├─→ Agent B: 收到 update_available
    └─→ Agent C: (离线, 下次注册时 Server 检测版本)
               │
               ▼
         HTTP GET /api/releases/{version}/download
               │
               ▼
         SHA256 校验 → 替换自身二进制 → 退出
               │
               ▼
         systemd Restart=always 自动拉起新版本
```

## Agent 变更

### 编译时注入版本号

在 Cargo.toml 中定义版本号（如 `version = "1.0.0"`），通过 `env!("CARGO_PKG_VERSION")` 在编译时注入。

Agent 新增 CLI 参数 `--version`：打印版本号后退出。

运行时版本通过 `env!("CARGO_PKG_VERSION")` 获取，上报到 Server。

### Register 消息扩展

Agent 在 register 时上报当前版本：

```json
{
  "type": "register",
  "node_id": "node-1",
  "token": "abc...",
  "agent_version": "1.0.0"
}
```

如果 `agent_version` 为空（旧 Agent），Server 不做版本对比，保持兼容。

### 处理 update_available

Agent 收到 Server 推送的更新通知后：

1. 记录日志 `Received update notification: version X.Y.Z`
2. 回复 `update_status: downloading`
3. 从 `server_url + download_url` 构造完整 URL，通过 HTTP GET 下载二进制到 `/tmp/node-agent-update`
4. 计算 SHA256 校验，与 Server 下发的 checksum 对比
5. 校验失败 → 回复 `update_status: failed, checksum mismatch`
6. 校验通过 → 回复 `update_status: ready`
7. 标记新二进制为可执行 (`chmod +x`)
8. 替换当前二进制（rename 方式）
9. 退出进程，由 systemd 自动重启为新版本

### 二进制替换逻辑（Rust 实现）

```rust
fn self_replace(new_bin_path: &Path) -> Result<()> {
    let current_exe = std::env::current_exe()?;
    let backup = current_exe.with_extension("old");

    // 清理上次残留的 .old 文件
    if backup.exists() {
        std::fs::remove_file(&backup)?;
    }

    // 重命名当前二进制为 .old
    std::fs::rename(&current_exe, &backup)?;

    // 移动新二进制到当前位置
    std::fs::rename(new_bin_path, &current_exe)?;

    // 设置可执行权限
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&current_exe, std::fs::Permissions::from_mode(0o755))?;
    }

    Ok(())
}
```

重命名后进程继续运行（Linux 允许重命名正在运行的可执行文件），退出后 systemd 用新二进制重新启动。

### 心跳扩展

Agent 的 `ping` 消息保持不变。如果 Agent 处于更新中状态，心跳逻辑不变化。

## Server 变更

### 数据库

新增 `releases` 表：

```sql
CREATE TABLE IF NOT EXISTS releases (
    version TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    checksum_sha256 TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

`nodes` 表新增字段（可选，通过 migration 添加）：

```sql
ALTER TABLE nodes ADD COLUMN agent_version TEXT DEFAULT '';
```

### 配置

`config.yaml` 新增字段：

```yaml
host: 0.0.0.0
port: 8902
db_path: data/node-manager.db
releases_dir: data/releases      # Agent 发布包存储目录
```

`_migrate()` 方法需要为新表和老表的新列做迁移。

### 新增 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/releases` | 上传新版本（multipart: version + file），自动设为 latest |
| `GET` | `/api/releases` | 版本列表（按时间降序） |
| `GET` | `/api/releases/latest` | 最新版本信息 |
| `GET` | `/api/releases/{version}/download` | 下载指定版本二进制 |
| `GET` | `/api/nodes/{id}/upgrade` | Web UI: 强制更新某节点 |

**POST /api/releases：**
```python
@app.post("/api/releases")
async def api_upload_release(request: Request):
    form = await request.form()
    version = form["version"]
    file = form["file"]  # UploadFile
    # 校验 version 格式（semver）
    # 保存文件到 releases_dir/{version}/node-agent
    # 计算 SHA256
    # 存入 releases 表
    # 向所有在线 Agent 推送 update_available
```

**GET /api/releases/{version}/download：**
```python
@app.get("/api/releases/{version}/download")
async def api_download_release(version: str):
    release = db.get_release(version)
    if not release:
        return JSONResponse({"error": "version not found"}, 404)
    file_path = Path(release["file_path"])
    if not file_path.exists():
        return JSONResponse({"error": "file not found"}, 404)
    return FileResponse(file_path, media_type="application/octet-stream",
                        filename=f"node-agent-{version}")
```

### WebSocket 协议扩展

**Server → Agent：**

```json
// 推送更新（download_url 为路径，Agent 用 server_url + download_url 构造完整 URL）
{"type": "update_available", "version": "1.2.0", "download_url": "/api/releases/1.2.0/download", "checksum_sha256": "abc...", "file_size": 5000000}
```

**Agent → Server：**

```json
// 更新状态
{"type": "update_status", "version": "1.2.0", "status": "downloading", "message": ""}
// status: downloading → ready → success
// status: downloading → failed
```

### 注册时版本检测

Agent 注册时，如果 `agent_version` 不为空且低于 Server 的 latest 版本，Server 自动推送 `update_available`。

版本比较使用简单字符串比较即可（semver 格式 `X.Y.Z` 自然排序兼容），或使用 `packaging.version` 库做严格 semver 比较。

```python
def _should_update(latest_ver: str, current_ver: str) -> bool:
    """比较语义版本号，latest > current 时返回 True。"""
    def as_tuple(v: str) -> tuple:
        parts = v.split(".")
        return tuple(int(p) for p in parts[:3])
    return as_tuple(latest_ver) > as_tuple(current_ver)

# agent_websocket 中，注册成功后
if agent_version:
    latest = db.get_latest_release()
    if latest and _should_update(latest["version"], agent_version):
        await ws.send_json({
            "type": "update_available",
            "version": latest["version"],
            ...
        })
```

### 上传后推送

新版本上传成功后，遍历 `active_connections`，向所有在线 Agent 推送更新通知：

```python
async def broadcast_update(release: dict):
    msg = json.dumps({
        "type": "update_available",
        "version": release["version"],
        "download_url": f"/api/releases/{release['version']}/download",
        "checksum_sha256": release["checksum_sha256"],
        "file_size": release["file_size"],
    })
    for ws in active_connections.values():
        try:
            await ws.send_text(msg)
        except Exception:
            pass
```

## Web UI

在节点详情页的 Tab 中增加"版本"标签（或直接在概览页显示当前版本和更新按钮）。

在管理页面增加 Release 管理区域：上传新版本、查看版本列表。

对于有更新的节点，显示"有新版本可用"的提示和"立即更新"按钮。

## 构建脚本更新

`build.sh` 在编译和打包后，增加上传步骤：

```bash
# 上传到 server
VERSION=$(./dist/node-agent --version 2>&1 | grep -oP '[\d]+\.[\d]+\.[\d]+')
curl -X POST http://localhost:8902/api/releases \
  -F "version=$VERSION" \
  -F "file=@dist/node-agent"
info "Agent v$VERSION 已上传到 Server"
```

## 兼容性

- 旧 Agent（无 `agent_version` 字段）注册时，Server 不推送更新
- Server 端的 WebSocket handler 对未知消息类型只打印日志，不做特殊处理（已有 `else: unknown message type` 逻辑）
- 新增的 `update_available` 对旧 Agent 是未知类型，会被忽略

## 实施步骤

1. Server: 数据库 migration（`releases` 表 + `agent_version` 字段）
2. Server: Release 管理 API（上传、列表、下载）
3. Server: WebSocket 扩展（推送 update_available + 注册时版本检测）
4. Agent: 编译时版本注入 + register 上报版本
5. Agent: 更新处理逻辑（下载、校验、替换、重启）
6. Web UI: 版本管理和更新操作界面
7. 构建脚本: 添加上传步骤

## 回滚方案

- 更新时旧二进制重命名为 `node-agent.old`，通过 SSH 可以手动恢复
- 如需 Server 端回滚：上传旧版本，重新推送更新即可
- 如果 Agent 更新后无法启动，systemd 会按 `RestartSec=15` 不断重试，需 SSH 登录手动恢复 `/usr/local/bin/node-agent.old`
