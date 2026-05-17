# blhx-monitor

监控 [碧蓝航线WIKI - 新闻公告](https://wiki.biligame.com/blhx/%E6%96%B0%E9%97%BB%E5%85%AC%E5%91%8A) 页面，自动发现新活动/更新公告并保存为 Markdown 文件。

## 工作原理

1. 每小时发送 HTTP 请求到 WIKI 新闻公告页（携带浏览器标头绕过 WAF）
2. 解析 HTML 提取所有公告链接（匹配 `\d{4}年` 格式的标题）
3. 与上次记录的链接集合对比，发现新增链接
4. 逐个抓取新增公告页面，提取正文内容
5. 保存为 `logs/YYYY-MM-DD-标题.md`，并追加到 `logs/change.log`

## 依赖

- Rust 1.70+（编译时）
- 无运行时依赖（不需要 Chromium、Node.js、Python 等）

## 快速开始

```bash
# 构建
git clone <repo>
cd blhx-monitor
cargo build --release

# 首次运行（会抓取所有现有公告作为 baseline）
./target/release/blhx-monitor

# 后续运行（仅抓取新增公告）
./target/release/blhx-monitor
```

## 输出结构

```
blhx-monitor/
├── blhx-monitor            # 编译后的二进制
├── known_links.json        # 已发现链接集合（自动维护）
├── logs/
│   ├── change.log          # 变更流水日志
│   ├── 2026-05-16-5月末大型活动预告.md
│   ├── 2026-05-16-2026年5月14日10_00港区改建.md
│   └── ...
```

### Markdown 文件格式

```markdown
# 2026年5月末大型活动预告

**发现时间**: 2026-05-16 22:55:53
**原始链接**: https://wiki.biligame.com/blhx/...

---

◆活动预告◆
圣印在辉光中沉降，光与影交叠。
...
```

### change.log 格式

```
[2026-05-16 22:55:53] NEW: 2026年5月末大型活动预告 (https://...)
[2026-05-16 22:55:54] NEW: 2026年5月14日10:00港区改建 (https://...)
```

## 定时执行（以 crontab 为例）

每小时执行一次：

```bash
crontab -e
# 添加：
0 * * * * cd /opt/blhx-monitor && ./blhx-monitor
```

## 技术细节

- **WAF 绕过**：站点 WAF 校验 `User-Agent` 和 `Referer` 头，使用真实浏览器标头即可正常访问
- **内容提取**：从 `.mw-parser-output` 提取纯文本，避免侧栏导航噪音
- **幂等**：状态持久化到 `known_links.json`，重复运行不会产生重复输出
