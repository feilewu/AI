# Proxy Manager - 反向代理管理面板

Python FastAPI 反向代理，带 Web 管理面板，统一管理多个后端服务的访问入口和认证。

## 原理

```
用户 → Proxy Manager (:8093, 需登录) → Node Manager (:8902)
                                    → Mdocs (:8000)
                                    → 其他后端服务
```

支持路径前缀转发、HTML 路径重写（保持相对链接正确）、服务自动发现。

## 快速开始

```bash
pip install -r requirements.txt
python main.py
# 或 docker compose up -d --build
```

默认运行在 `http://localhost:8093`。首次访问会进入登录页，默认密码在 `config.yaml` 中设置。

## 功能

- **反向代理**: 为每个后端服务配置路径前缀和目标地址，自动转发请求
- **HTML 重写**: 代理时自动重写 HTML 中的链接路径，添加服务前缀
- **服务发现**: 自动扫描主机上的 HTTP 服务端口，一键添加
- **面板认证**: HMAC 签名 Cookie 会话管理
- **敏感路径保护**: 配置路径规则（如 `/manage*`, `/api/*`），未登录时拦截跳转登录页
- **登录回跳**: 登录后自动回到触发登录的页面

## 配置

`config.yaml`:
```yaml
host: 0.0.0.0
port: 8093
db_path: data/proxy-manager.db
auth_password: "admin123"   # 管理密码，空=不启用认证
secret_key: ""              # Cookie 签名密钥，空=自动生成
```
