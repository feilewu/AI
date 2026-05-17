# 碧蓝航线公告监控 (blhx-monitor)

Rust 工具，定时抓取[碧蓝航线 WIKI 新闻页面](https://wiki.biligame.com/blhx/%E6%96%B0%E9%97%BB%E5%85%AC%E5%91%8A)，
发现新公告后下载并保存为 Markdown 文件。

## 使用

```bash
cargo build --release
./target/release/blhx-monitor
```

每次运行会对比 `known_links.json` 中的已抓取链接，新链接则下载全文并追加到 `logs/change.log`。

建议通过 cron 定时执行。

## 配置

配置硬编码在 `src/main.rs` 中：目标 URL、状态文件路径、日志目录。
