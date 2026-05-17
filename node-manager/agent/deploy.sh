#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────
# Node Manager Agent 部署脚本
# 支持: 本地安装 / SSH 远程部署
# ──────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY_SRC="${BINARY_SRC:-"$SCRIPT_DIR/target/release/node-agent"}"
CONFIG_DIR="/etc/node-agent"
BINARY_DST="/usr/local/bin/node-agent"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
err()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }

usage() {
  cat <<EOF
用法: $0 [选项]

必需参数 (至少一个):
  --server-url URL   WebSocket 地址 (如 ws://192.168.1.100:8902)
  --node-id   ID     节点 ID
  --token     TOKEN  节点认证 Token

部署模式:
  (无额外参数)        本地安装到本机
  --remote  USER@HOST 通过 SSH 部署到远程主机

可选:
  --binary   PATH     指定 node-agent 二进制路径
  --port     PORT     SSH 端口 (默认 22)
  --build             从源码编译 (需要 Rust 环境)
  --help              显示帮助

示例:
  # 本地安装
  $0 --server-url ws://10.0.0.1:8902 --node-id node-1 --token abc... --build

  # 远程部署
  $0 --server-url ws://10.0.0.1:8902 --node-id node-2 --token def... \\
     --remote root@192.168.1.50 --build
EOF
  exit 0
}

# ── 解析参数 ──────────────────────────────────────

SERVER_URL=""; NODE_ID=""; TOKEN=""; REMOTE=""; SSH_PORT=22; DO_BUILD=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server-url) SERVER_URL="$2";  shift 2 ;;
    --node-id)    NODE_ID="$2";     shift 2 ;;
    --token)      TOKEN="$2";       shift 2 ;;
    --remote)     REMOTE="$2";      shift 2 ;;
    --port)       SSH_PORT="$2";    shift 2 ;;
    --binary)     BINARY_SRC="$2";  shift 2 ;;
    --build)      DO_BUILD=true;    shift ;;
    --help|-h)    usage ;;
    *) err "未知参数: $1" ;;
  esac
done

[[ -z "$SERVER_URL" || -z "$NODE_ID" || -z "$TOKEN" ]] && { warn "缺少必需参数"; usage; }

# ── 编译 ──────────────────────────────────────────

build_agent() {
  echo ">>> 编译 node-agent (release)..."
  cd "$SCRIPT_DIR"
  cargo build --release
  BINARY_SRC="$SCRIPT_DIR/target/release/node-agent"
  info "编译完成: $BINARY_SRC"
}

if [ "$DO_BUILD" = true ]; then
  build_agent
elif [ ! -f "$BINARY_SRC" ]; then
  warn "未找到二进制: $BINARY_SRC，正在编译..."
  build_agent
fi

# ── 部署到远程 ────────────────────────────────────

deploy_remote() {
  local host="$1"
  echo ">>> 部署到 $host ..."

  ssh -p "$SSH_PORT" "$host" "mkdir -p $CONFIG_DIR"
  scp -P "$SSH_PORT" "$BINARY_SRC" "$host:$BINARY_DST"
  ssh -p "$SSH_PORT" "$host" "chmod +x $BINARY_DST"

  ssh -p "$SSH_PORT" "$host" "cat > $CONFIG_DIR/config.toml" <<TOML
server_url = "$SERVER_URL"
node_id = "$NODE_ID"
token = "$TOKEN"
TOML

  ssh -p "$SSH_PORT" "$host" "cat > /etc/systemd/system/node-agent.service" <<UNIT
[Unit]
Description=Node Manager Agent
After=network.target

[Service]
ExecStart=$BINARY_DST --config $CONFIG_DIR/config.toml
Restart=always
RestartSec=15
User=root

[Install]
WantedBy=multi-user.target
UNIT

  ssh -p "$SSH_PORT" "$host" "systemctl daemon-reload && systemctl enable --now node-agent"
  info "远程部署完成: $host  ($NODE_ID)"
  ssh -p "$SSH_PORT" "$host" "journalctl -u node-agent -n 10 --no-pager"
}

# ── 本地安装 ──────────────────────────────────────

deploy_local() {
  echo ">>> 本地安装 ..."

  sudo mkdir -p "$CONFIG_DIR"
  sudo cp "$BINARY_SRC" "$BINARY_DST"
  sudo chmod +x "$BINARY_DST"

  sudo tee "$CONFIG_DIR/config.toml" > /dev/null <<TOML
server_url = "$SERVER_URL"
node_id = "$NODE_ID"
token = "$TOKEN"
TOML

  sudo tee /etc/systemd/system/node-agent.service > /dev/null <<UNIT
[Unit]
Description=Node Manager Agent
After=network.target

[Service]
ExecStart=$BINARY_DST --config $CONFIG_DIR/config.toml
Restart=always
RestartSec=15
User=root

[Install]
WantedBy=multi-user.target
UNIT

  sudo systemctl daemon-reload
  sudo systemctl enable --now node-agent
  info "本地安装完成: $NODE_ID"
  sudo journalctl -u node-agent -n 10 --no-pager
}

# ── 入口 ──────────────────────────────────────────

if [[ -n "$REMOTE" ]]; then
  deploy_remote "$REMOTE"
else
  deploy_local
fi
