# Node Manager - 远程节点管理

WebSocket 架构的远程服务器管理工具。支持多节点注册、实时监控、远程命令执行、日志查看。

## 架构

```
┌─────────────────┐      WebSocket       ┌──────────────┐
│  Node Manager    │ ◄───────────────── ► │  Node Agent   │
│  Server (:8902)  │                      │  (每台节点)    │
│  FastAPI + SQLite │                      │  Rust 二进制   │
└─────────────────┘                      └──────────────┘
```

推荐通过 Proxy Manager (`:8093/node-manager/`) 代理访问以获得认证保护。

## 快速开始

```bash
# 编译 Agent + 构建 Docker + 部署包
./build.sh

# 部署 Agent 到远程节点
./agent/deploy.sh --ssh user@host --node-id my-node --token my-token
```

## 组件

### Server (`server/`)

Python FastAPI 应用，Docker 运行。提供：
- Web 仪表盘：节点列表、状态卡片、实时指标
- 节点详情：CPU/内存/磁盘/网络、命令执行、日志查看
- Agent WebSocket 接入 (`/ws/agent`)
- 节点 CRUD API

### Agent (`agent/`)

Rust 二进制，部署到被管理节点。功能：
- WebSocket 连接 Server 并注册
- 每 60s 采集系统指标上报
- 每 30s 发送心跳
- 接收并执行 Server 下发的 shell 命令
- 支持 systemd 自启

## 配置

`server/config.yaml`:
```yaml
host: 0.0.0.0
port: 8902
db_path: data/node-manager.db
```

Agent 配置: `--server-url ws://host:8902 --node-id <id> --token <token>`
