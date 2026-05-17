# Node Manager — 多节点管理 Web 平台

## 概述

管理若干台 Linux 云服务器的 Web 平台，提供实时监控和远程运维能力。节点通过轻量 Agent 反向连接中心服务器。

## 约束

| 项目 | 要求 |
|------|------|
| 节点规模 | < 10 台 |
| 节点 OS | Linux |
| 连接方式 | Agent 反向连接（节点无公网 IP） |
| Agent 资源 | 尽量省内存和 CPU |
| 管理范围 | 监控（CPU/内存/磁盘/网络）+ 运维（远程命令、日志、服务启停） |
| 告警 | 初期仅 Web UI 展示，后续扩展 |
| Server 技术栈 | Python FastAPI（与 mdocs 一致） |
| Agent 技术栈 | Rust（轻量单二进制，已有经验） |

## 架构总览

```
┌─────────────────────────────────────────────────────┐
│                   Central Server                     │
│  Python FastAPI + SQLite + WebSocket                 │
│                                                      │
│  ┌──────────┐  ┌────────────┐  ┌──────────────────┐  │
│  │ Web UI   │  │ REST API   │  │ WebSocket Server │  │
│  │ (HTMX)   │  │            │  │ (管理 Agent 连接) │  │
│  └──────────┘  └────────────┘  └──────────────────┘  │
│                       │                │              │
│                       ▼                ▼              │
│  ┌──────────────────────────────────────────────────┐ │
│  │  SQLite (节点信息 + 指标历史 + 命令记录)          │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────┘
                       │ WebSocket (Agent 主动连出)
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   ┌─────────┐   ┌─────────┐   ┌─────────┐
   │ Agent 1 │   │ Agent 2 │   │ Agent N │
   │ (Rust)  │   │ (Rust)  │   │ (Rust)  │
   └─────────┘   └─────────┘   └─────────┘
```

## 组件设计

### 1. Agent (Rust)

轻量守护进程部署在每个节点上，唯一职责是连接 Server 并执行指令。

**配置格式（`/etc/node-agent/config.toml`）：**
```toml
server_url = "wss://panel.example.com/ws/agent"
node_id = "node-1"
token = "server_generated_token"
```

**启动流程：**
1. 读取配置文件
2. 建立 WebSocket 连接到 Server，发送 `register` 消息（含 node_id + token）
3. 服务端验证 token，验证通过后节点标记为 `online`，开始心跳（每 30s）
4. 按固定间隔上报系统指标
5. 等待 Server 下发命令并执行

**Token 生成：** Server 启动时预先生成，通过 Web UI 添加节点时创建并展示，部署 Agent 时写入配置文件。

**采集指标：**

| 指标 | 来源 | 频率 |
|------|------|------|
| CPU 使用率 | `sysinfo::System::global_cpu_usage` | 60s |
| 内存使用量 | `sysinfo::System::used_memory` / `total_memory` | 60s |
| 磁盘使用率 | `sysinfo::Disks` (statvfs) | 60s |
| 网络流量 | `/proc/net/dev` 解析 | 60s |
| 负载 (loadavg) | `sysinfo::System::load_average` | 60s |
| 进程列表 | TODO | 待实现 |

**支持的运维操作：**

| 操作 | 实现方式 |
|------|----------|
| 执行 shell 命令 | `tokio::process::Command::new("sh").arg("-c")`，返回 stdout/stderr/exit code |
| 查看服务状态 | 通过 shell 执行 `systemctl status <name>` |
| 启动/停止服务 | 通过 shell 执行 `systemctl start/stop <name>` |
| 查看日志片段 | Server 下发 `journalctl -n <lines> -u <name>` 命令，Agent 执行并返回 |
| 查看进程列表 | 已采集的进程数据，无需额外操作 |

所有运维操作统一通过 WebSocket `exec` 消息下发，Agent 执行完成后以 `cmd_result` 返回。

**资源占用目标：** 二进制 < 5MB，常驻内存 < 10MB，CPU < 0.5%。

**依赖 crate：** `tokio`（异步运行时）、`tokio-tungstenite`（WebSocket 客户端）、`serde`/`serde_json`（序列化）、`sysinfo`（系统指标）、`clap`（CLI 参数）、`tracing`（日志）。

### 2. Server (Python FastAPI)

Web 服务端，与 mdocs 复用相同的技术模式。

**功能模块：**

| 模块 | 职责 |
|------|------|
| WebSocket Handler | 管理 Agent 连接池、心跳检测、消息路由 |
| Metrics Store | 接收 Agent 指标并存入 SQLite，提供查询接口 |
| Command Dispatch | 将用户指令通过 WebSocket 下发到指定 Agent |
| Web UI | HTMX 驱动的管理面板 |
| REST API | 给 Agent 和 Web UI 提供数据接口 |

**数据模型 (SQLite)：**

```sql
-- 节点注册信息
CREATE TABLE nodes (
    id TEXT PRIMARY KEY,              -- 节点唯一标识
    name TEXT NOT NULL,               -- 显示名称
    token TEXT NOT NULL,              -- 认证 Token
    status TEXT DEFAULT 'offline',    -- online / offline / error
    last_seen TIMESTAMP,
    os_info TEXT,                     -- JSON: 内核版本等
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 指标数据（时序）
CREATE TABLE metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cpu_pct REAL,
    memory_pct REAL,
    memory_used_mb REAL,
    disk_pct REAL,
    disk_used_gb REAL,
    net_rx_bytes INTEGER,
    net_tx_bytes INTEGER,
    load_1m REAL,
    load_5m REAL,
    load_15m REAL
);
CREATE INDEX idx_metrics_node_ts ON metrics(node_id, ts);

-- 运维命令记录
CREATE TABLE commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    cmd_type TEXT NOT NULL,           -- shell / service_status / service_start / journal
    cmd_content TEXT NOT NULL,
    status TEXT DEFAULT 'pending',    -- pending / running / success / failed
    result TEXT,                      -- stdout + stderr
    exit_code INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    executed_at TIMESTAMP
);

-- 告警规则（后续扩展用）
CREATE TABLE alert_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT,                     -- NULL 表示全局规则
    metric TEXT NOT NULL,             -- cpu_pct / memory_pct / disk_pct
    operator TEXT NOT NULL,           -- gt / lt
    threshold REAL NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3. Web UI

使用 HTMX（与 mdocs 一致）实现的轻量管理面板，无前端构建步骤。

**页面布局：**

```
┌─────────────────────────────────────────────────┐
│  Header: NodeManager      [搜索] [状态总览]     │
├──────────┬──────────────────────────────────────┤
│ 侧栏     │  主内容区                             │
│          │                                       │
│ ● node-1 │  [节点状态卡片]  [CPU] [内存] [磁盘]  │
│ ● node-2 │                                       │
│ ○ node-3 │  ┌─ 实时指标折线图 ─────────────────┐ │
│          │  │                                   │ │
│          │  └───────────────────────────────────┘ │
│          │                                       │
│          │  ┌─ 终端 / 命令执行 ─────────────────┐ │
│          │  │  $ systemctl status nginx          │ │
│          │  │  ● nginx.service - loaded          │ │
│          │  └───────────────────────────────────┘ │
└──────────┴──────────────────────────────────────┘
```

**路由设计：**

| 路由 | 功能 |
|------|------|
| `/` | 仪表盘：所有节点状态总览 |
| `/nodes/{id}` | 节点详情：实时指标 + 最近命令 + Tab 导航 |
| `/nodes/{id}/command` | 命令执行表单 |
| `/nodes/{id}/logs` | 日志查看器 |
| `/manage` | 节点管理（添加/删除节点）|
| `/api/nodes` | REST: 节点列表 / 添加节点 |
| `/api/nodes/{id}` | REST: 删除节点 |
| `/api/nodes/{id}/command` | REST: 下发命令 |
| `/api/nodes/{id}/commands` | REST: 命令历史 |
| `/api/nodes/{id}/metrics` | REST: 指标查询 |
| `/api/nodes/{id}/regenerate-token` | REST: 重新生成 Token |
| `/ws/agent` | WebSocket: Agent 接入 |

### 4. WebSocket 协议

Agent 与 Server 之间的通信协议，基于 JSON 消息。

**Agent → Server：**

```json
// 注册
{"type": "register", "node_id": "...", "token": "..."}
// 心跳
{"type": "ping"}
// 指标上报
{"type": "metrics", "cpu_pct": 45.2, "memory_pct": 62.1, ...}
// 命令结果返回
{"type": "cmd_result", "cmd_id": 123, "exit_code": 0, "stdout": "...", "stderr": ""}
```

**Server → Agent：**

```json
// 心跳响应
{"type": "pong"}
// 执行命令
{"type": "exec", "cmd_id": 123, "command": "systemctl status nginx"}
// 采集指标（触发式）
{"type": "collect_metrics"}
```

## 部署架构

```
Server 部署方式：
- 单进程 FastAPI + uvicorn
- SQLite 数据库文件持久化
- 可通过 Docker 部署（见下方）

Agent 部署方式：
- Rust 交叉编译为 Linux 静态二进制
- scp 到目标节点后以 systemd service 方式运行
- 配置文件 /etc/node-agent/config.toml
```

### Docker 部署

**Dockerfile** (`server/Dockerfile`):

- 基于 `python:3.12-slim`
- 使用清华 PyPI 镜像加速
- 暴露端口 8902，启动 uvicorn 服务

**docker-compose** (`docker-compose.yml`):

```yaml
services:
  node-manager:
    build: server
    ports:
      - "8902:8902"
    volumes:
      - ./server/data:/app/data          # SQLite 持久化
      - ./server/config.yaml:/app/config.yaml  # 配置文件挂载
    restart: unless-stopped
```

**构建与运行：**

```bash
cd node-manager

# 构建镜像
docker build -t node-manager:latest server/

# 首次运行前初始化种子节点（仅在全新数据库时）
docker run --rm -v ./server/data:/app/data node-manager:latest python seed.py

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

## 实施阶段

| 阶段 | 内容 | 里程碑 | 状态 |
|------|------|--------|------|
| **Phase 1** | Agent 骨架：WebSocket 连接 + 注册 + 心跳 + 基础指标采集 | Agent 能连接 Server 并上报数据 | ✅ 完成 |
| **Phase 2** | Server 骨架：WebSocket Handler + 节点管理 + 指标存储 | 节点在线状态可在 Web UI 查看 | ✅ 完成 |
| **Phase 3** | Web UI 仪表盘：节点状态卡片 + 实时指标 | 每个节点的指标可视化 | ✅ 完成 |
| **Phase 4** | 运维命令：Server 下发 → Agent 执行 → 结果返回 | 可在 Web UI 执行远程命令 | ✅ 完成 |
| **Phase 5** | 日志查看 + 节点管理 | 完整的监控 + 运维能力 | ✅ 完成 |
| **Phase 6** | 告警规则 + 通知扩展（可选） | 后续按需开启 | ⏳ 待办 |

**Phase 3～5 实现细节：**

- Agent 通过 `sh -c` 执行任意 shell 命令（含 `systemctl`），结果通过 WebSocket 的 `cmd_result` 返回
- 日志查看使用 `journalctl -n N -u <service>`，由 Server 通过命令下发机制实现
- Web UI 包含仪表盘、节点详情（含网络指标）、命令执行页面、日志查看器、节点管理页面，全部基于 HTMX 无刷新
- 节点管理页面支持添加节点（自动生成 ID/Token）、删除节点、重新生成 Token
