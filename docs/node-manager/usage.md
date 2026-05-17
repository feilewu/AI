# Node Manager 使用手册

## 添加节点

### 方式一：Web UI 管理页面

1. 浏览器打开 http://localhost:8902
2. 顶部导航点击 **管理**
3. 在 **添加节点** 表单中填写：
   - **节点 ID** — 可选，留空自动生成（如 `node-a1b2c3d4`）
   - **显示名称** — 必填，如 `Web Server`、`Database`
   - **Token** — 可选，留空自动生成 32 位随机 hex
4. 点击 **添加节点**
5. 页面上方会显示节点 ID 和 Token，记录下来用于部署 Agent

### 方式二：API 添加

```bash
curl -X POST http://localhost:8902/api/nodes \
  -H "Content-Type: application/json" \
  -d '{"name": "My Server"}'
```

返回：

```json
{"node_id": "node-a1b2c3d4", "token": "abc123..."}
```

也可指定 ID 和 Token：

```bash
curl -X POST http://localhost:8902/api/nodes \
  -H "Content-Type: application/json" \
  -d '{"id": "my-vm-1", "name": "My Server", "token": "my-secret-token"}'
```

---

## 部署 Agent

### 方式一：使用部署包（推荐）

项目根目录执行 `./build.sh` 后，会在 `dist/` 生成 `node-agent-release.tar.gz`。

```bash
# 解压部署包
tar xzf node-agent-release.tar.gz
# 输出: node-agent (二进制) + deploy.sh (部署脚本)
```

**本地安装**（在要管理的节点上执行）：

```bash
./deploy.sh \
  --server-url ws://your-server:8902 \
  --node-id node-a1b2c3d4 \
  --token "abc123..."
```

**远程部署**（从构建机器 SSH 到目标节点）：

```bash
./deploy.sh \
  --server-url ws://your-server:8902 \
  --node-id node-1 \
  --token "abc123..." \
  --remote root@192.168.1.50
```

部署脚本自动完成：复制二进制 → 写 config.toml → 创建 systemd 服务 → 启动。

### 方式二：手动部署

**前提：** Agent 是 Rust 编译的单一二进制文件，部署在要管理的 Linux 节点上。

**编译：**

```bash
cd node-manager/agent
cargo build --release
# 二进制在 target/release/node-agent
```

交叉编译到其他架构参考 Rust 交叉编译文档。

**手动部署：**

将编译好的 `node-agent` 复制到目标节点，创建配置文件 `/etc/node-agent/config.toml`：

```toml
server_url = "ws://your-server:8902"
node_id = "node-a1b2c3d4"
token = "abc123..."
```

**运行测试：**

```bash
./node-agent --config /etc/node-agent/config.toml
# 或使用命令行参数
./node-agent --server-url "ws://your-server:8902" --node-id "node-a1b2c3d4" --token "abc123..."
```

**注册 systemd 服务：**

创建 `/etc/systemd/system/node-agent.service`：

```ini
[Unit]
Description=Node Manager Agent
After=network.target

[Service]
ExecStart=/usr/local/bin/node-agent --config /etc/node-agent/config.toml
Restart=always
RestartSec=15
User=root

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now node-agent
sudo journalctl -u node-agent -f  # 查看日志
```

---

## 验证节点在线

部署 Agent 后，在 Web UI 仪表盘可见节点状态变为 **绿色圆点（在线）**，并显示 CPU/内存/磁盘指标。

每 60s 上报一次指标，每 30s 发送心跳。

---

## 常用操作

### 查看节点详情

仪表盘点击节点卡片 → 概览页显示：

- 实时指标卡片（CPU/内存/磁盘/网络/负载）
- 历史指标表格
- 最近命令记录

### 远程执行命令

1. 进入节点详情 → 点击 **命令** 标签
2. 输入 shell 命令（如 `systemctl status nginx`）
3. 点击 **执行**，结果实时返回
4. 支持快捷按钮：`uptime`、`free -h`、`df -h`、`top mem`

### 查看日志

1. 进入节点详情 → 点击 **日志** 标签
2. 可选填写服务名（如 `nginx`）和行数
3. 点击 **获取日志**，Server 远程执行 `journalctl -n <lines> -u <service>`

### 管理节点

管理页面支持：

- **添加节点** — 创建新节点和 Token
- **删除节点** — 删除节点及其指标/命令记录
- **重新生成 Token** — 通过 API 调用 `POST /api/nodes/{id}/regenerate-token`

---

## API 参考

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/nodes` | 节点列表 |
| POST | `/api/nodes` | 添加节点 |
| DELETE | `/api/nodes/{id}` | 删除节点 |
| POST | `/api/nodes/{id}/command` | 下发命令 |
| GET | `/api/nodes/{id}/commands?limit=50` | 命令历史 |
| POST | `/api/nodes/{id}/regenerate-token` | 重新生成 Token |
