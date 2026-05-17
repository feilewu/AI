# Markdown 文档服务器 (mdocs)

Python FastAPI 应用，将 Markdown 文件目录渲染为带搜索功能的 Web 文档站。

## 使用

```bash
pip install -r requirements.txt
python main.py
# 或 docker compose up -d --build
```

默认运行在 `http://localhost:8000`。

## 功能

- Markdown 渲染 + Pygments 代码高亮
- 可折叠目录树侧栏
- 全文搜索（SQLite FTS5）
- 文件变更热重载
- `/media/` 图片静态文件服务

## 配置

`config.yaml`:
```yaml
docs_root: ./docs    # Markdown 文件根目录
host: 0.0.0.0
port: 8000
```
