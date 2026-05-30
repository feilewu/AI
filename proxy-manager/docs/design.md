# Proxy Manager — 本地服务反向代理 + 管理面板

## 概述

在同一台机器上运行多个 Web 服务时，通过统一的 HTTP 入口管理并访问它们。自动探测本地监听端口的 HTTP 服务，提供 Web UI 动态配置路径转发规则。

## 约束

| 项目 | 要求 |
|------|------|
| 运行位置 | 与目标服务同机部署 |
| 路由方式 | 路径前缀区分不同服务 |
| 配置方式 | Web UI 动态管理 + SQLite 持久化 |
| 服务发现 | 自动扫描本地端口 + HTTP 探测 |
| 技术栈 | Python FastAPI（与 node-manager 一致） |

## 架构

```
                         ┌──────────────────────────┐
                         │     proxy-manager         │
  Browser                │     FastAPI :8093         │
    │                    │                           │
    ├── / → 仪表盘       │  ┌──── middleware ──────┐ │
    ├── /myapp/login →   │  │  路径匹配?            │ │
    ├── /blog/posts  →   │  │  ├─ yes → httpx 转发  │─┤─► localhost:3000
    └── /api/users   →   │  │  └─ no  → FastAPI 路由 │ │
                         │  └───────────────────────┘ │
                         │                           │
                         │  SQLite (服务配置)         │
                         └──────────────────────────┘
```

## 组件设计

### 1. 代理转发 (proxy.py)

FastAPI ASGI Middleware，拦截所有请求：

1. 取请求路径 `/<path>`
2. 遍历已注册服务，检查 `path.starts-with(service.prefix)`
3. 匹配成功：用 `httpx.AsyncClient` 转发请求到目标服务
   - 保持原始 method、headers、body、query string
   - 用 `StreamingResponse` 流式返回响应体
   - 超时 30s
4. 匹配失败：继续正常 FastAPI 路由

### 2. 服务自动探测 (scanner.py)

手动触发的扫描流程：

1. 执行 `ss -tlnp` 解析所有 LISTEN 端口
2. 过滤：排除已注册服务端口、自身端口
3. 对每个剩余端口发送 `GET /`（timeout=2s）
4. 收到 HTTP 响应 → 记录为"已探测"服务
5. 返回探测结果列表，UI 展示并允许一键添加

### 3. 数据模型 (SQLite)

```sql
CREATE TABLE services (
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
```

### 4. REST API

端点根据 `HX-Request` 头决定响应格式：

| 方法 | 路径 | HTMX 响应 | JSON 响应 |
|------|------|-----------|-----------|
| GET | `/` | 仪表盘 HTML | — |
| GET | `/api/services` | — | `{"services": [...]}` |
| POST | `/api/services` | `service_list.html` 片段 | `{"id": N}` |
| PUT | `/api/services/{id}` | — | `{"status": "updated"}` |
| DELETE | `/api/services/{id}` | 空响应（删除卡片） | `{"status": "deleted"}` |
| GET | `/api/services/scan` | `scan_results.html` 片段 | `{"detected": [...]}` |

- 表单提交使用 `application/x-www-form-urlencoded`（HTMX 默认）
- 非 HTMX 客户端（如 `curl`）使用 `application/json`

### 5. Web UI

基于 HTMX（与 node-manager 一致），无前端构建步骤。

**模板结构：**

| 模板 | 用途 |
|------|------|
| `base.html` | 布局 + HTMX 初始化 |
| `dashboard.html` | 仪表盘（继承 base） |
| `service_list.html` | 服务网格片段（CRUD 后替换） |
| `scan_results.html` | 扫描结果片段（一键添加） |

**仪表盘 `/`：**

```
┌─────────────────────────────────────────────┐
│  Proxy Manager     [扫描服务] [添加服务]      │
├─────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ myapp     │  │ blog     │  │ api      │  │
│  │ /myapp..  │  │ /blog..  │  │ /api..   │  │
│  │ :3000     │  │ :4000    │  │ :5000    │  │
│  │ [访问]    │  │ [访问]   │  │ [访问]   │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│                                             │
│  自动探测结果：                               │
│  ┌─────────────────────────────────────┐    │
│  │ :8080  nginx              [添加]    │    │
│  │ :9000  Portainer          [添加]    │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

**HTMX 交互流程：**

1. **扫描服务**：点击 → 请求 `GET /api/services/scan`（HX-Request: true）→ 返回 `scan_results.html` 片段 → 替换 `#scan-results`
2. **添加服务（手动）**：填写表单 → `POST /api/services`（HX-Request: true）→ 返回 `service_list.html` 片段 → 替换 `#service-list`
3. **添加服务（扫描结果）**：点击扫描结果中的"添加" → `POST /api/services`（HX-Request: true）→ 替换 `#service-list`，删除该扫描卡片
4. **删除服务**：确认 → `DELETE /api/services/{id}`（HX-Request: true）→ 空响应 → 用 outerHTML 移除卡片

## 文件结构

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
│   ├── dashboard.html   # Main dashboard
│   ├── service_list.html# Service grid fragment (HTMX swap target)
│   └── scan_results.html# Scan results fragment (HTMX swap target)
├── static/
│   └── style.css        # Styles (light/dark mode)
├── Dockerfile           # Docker build
├── docker-compose.yml   # Docker compose
└── data/                # SQLite storage (created at runtime)
```

## 部署

```yaml
services:
  proxy-manager:
    build: .
    network_mode: "host"
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

使用 `network_mode: host` 以便扫描和代理宿主机上的本地服务。
