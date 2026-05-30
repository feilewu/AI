# 碧蓝航线WIKI 公告监控系统 设计文档

## 目标

监控 `wiki.biligame.com/blhx/新闻公告` 页面，当游戏发布新活动/更新公告时，自动抓取全文并保存为本地 Markdown 文件。

## 约束

- 目标站点有 WAF（返回 HTTP 567），拦截原始自动化请求
- WAF 校验 **Referer 头**和 **User-Agent**，加上浏览器标头即可绕过
- 仅需关注新闻公告页面及其子页面
- 通知方式：本地日志记录（不需要推送）
- 部署环境：云服务器 / VPS
- 检查频率：每 1 小时
- 开发语言：Rust

## 方案

通过 `reqwest` HTTP 客户端携带浏览器 Headers（`User-Agent` + `Referer` + `Accept-Language`）请求目标页面，绕过 WAF。使用 `scraper` crate 解析 HTML 提取链接。记录已知链接集合，每次运行对比差异，仅处理新增链接。

无需无头浏览器，零外部 runtime 依赖。

## 架构

```
定时调度 (每小时) ──▶ blhx-monitor (Rust binary)
                    │
                    ├─ 1. 读取 known_links.json（上次已知链接）
                    ├─ 2. reqwest GET 新闻公告页面（带 UA + Referer）
                    ├─ 3. scraper 提取所有公告链接 (<a> 标签)
                    ├─ 4. 对比发现新增链接?
                    │    ├─ 是 → reqwest 逐个抓取 → 从 .mw-parser-output 提取纯文本
                    │    │      → 写入 logs/{日期}-{标题}.md
                    │    │      → 追加 change.log
                    │    └─ 否 → 静默跳过
                    └─ 5. 更新 known_links.json
```

## 文件结构

```
/opt/blhx-monitor/
├── blhx-monitor          # 编译后的二进制
├── known_links.json      # 已发现的公告链接集合 (BTreeSet)
└── logs/
    ├── change.log        # 新增公告流水日志，格式: [时间] NEW: 标题 (URL)
    └── 2026-05-16-5月末大型活动预告.md  # 公告全文 Markdown
```

## 核心逻辑

### 链接发现

- 使用 `reqwest::blocking::Client` 发送 HTTP GET 请求
- 必需 Headers：
  - `User-Agent`: `Mozilla/5.0 ... Chrome/147...`
  - `Accept`: `text/html,...`
  - `Accept-Language`: `zh-CN,zh;q=0.9`
  - `Referer`: `https://wiki.biligame.com/blhx/新闻公告`（绕过 WAF 关键）
- 解析 HTML 使用 `scraper` crate
- 页面选择器优先级：`.mw-parser-output` → `#mw-content-text` → `body`
- 链接过滤：
  - 排除导航链接（`#`、`Special:`、`Category:`）
  - 文本匹配正则 `\d{4}年`（形如"2026年5月7日10:00港区改建"）
- 相对 URL 自动补全为 `https://wiki.biligame.com/...`

### 内容抓取

- 对每个新公告，发送 GET 请求（同样带 Referer）
- 从 `.mw-parser-output` 提取纯文本，清洗空白行
- 保存为 Markdown 文件，包含标题、发现时间、原始链接、正文

### 状态持久化

- `known_links.json`: `{"known_links": ["url1", "url2", ...]}`，有序集合
- 首次运行：所有当前链接作为 baseline，全部抓取
- 后续运行：仅处理不在集合中的新链接

## 依赖

| Crate | 用途 |
|-------|------|
| `reqwest` | HTTP 客户端（blocking + rustls-tls） |
| `scraper` | HTML 解析与 CSS 选择器 |
| `serde` / `serde_json` | JSON 序列化 |
| `regex` | 链接文本匹配 |
| `chrono` | 时间戳格式化 |
| `anyhow` | 错误处理 |

## 部署

```bash
cd /path/to/blhx-monitor
cargo build --release
./target/release/blhx-monitor
```

每小时自动执行由 cron 或 systemd timer 配置（具体方式由部署者根据环境决定）。

## 非功能性要求

- **幂等性**：多次运行不会产生重复文件或重复日志
- **容错**：单个公告抓取失败不影响其他公告；网络错误不破坏状态文件
- **零外部依赖**：无需 Chromium、数据库或其他服务
