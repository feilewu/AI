#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/dist"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
err()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ── 1. 编译 Agent ─────────────────────────────────
echo ">>> 编译 Agent (release) ..."
cd "$SCRIPT_DIR/agent"
cargo build --release
info "Agent 编译完成"

# ── 2. 构建 + 启动 Server (docker compose) ───────
echo ">>> 构建并启动 Server (docker compose) ..."
cd "$SCRIPT_DIR"
docker compose up -d --build
info "Server 启动完成"

# ── 3. 初始化种子节点 ─────────────────────────────
echo ">>> 初始化种子节点 ..."
docker compose exec -T node-manager python seed.py 2>&1 || true
info "种子节点已生成 (可在管理页面删除)"

# ── 4. 打包 Agent 部署包 ───────────────────────────
echo ">>> 打包 Agent 部署包 ..."
mkdir -p "$OUTPUT_DIR"

AGENT_BIN="$SCRIPT_DIR/agent/target/release/node-agent"
DEPLOY_SCRIPT="$SCRIPT_DIR/agent/deploy.sh"

[ -f "$AGENT_BIN" ] || err "Agent 二进制未找到: $AGENT_BIN"
[ -f "$DEPLOY_SCRIPT" ] || err "部署脚本未找到: $DEPLOY_SCRIPT"

cp "$AGENT_BIN" "$OUTPUT_DIR/node-agent"
cp "$DEPLOY_SCRIPT" "$OUTPUT_DIR/deploy.sh"
chmod +x "$OUTPUT_DIR/node-agent" "$OUTPUT_DIR/deploy.sh"

TAR_FILES="node-agent deploy.sh"
USAGE_DOC="$SCRIPT_DIR/../docs/node-manager/usage.md"
if [ -f "$USAGE_DOC" ]; then
  cp "$USAGE_DOC" "$OUTPUT_DIR/usage.md"
  TAR_FILES="$TAR_FILES usage.md"
fi

cd "$OUTPUT_DIR"
tar czf node-agent-release.tar.gz $TAR_FILES
rm -f $TAR_FILES

info "部署包: $OUTPUT_DIR/node-agent-release.tar.gz"
echo ""
echo "══════════════════════════════════════════════"
echo " 构建完成"
echo ""
echo " Server:   http://localhost:8902"
echo " Agent:    tar xzf dist/node-agent-release.tar.gz"
echo "           ./deploy.sh --server-url ws://<server>:8902 --node-id <id> --token <token>"
echo ""
echo " 管理页面: http://localhost:8902/manage"
echo " API:      curl http://localhost:8902/api/nodes"
echo "══════════════════════════════════════════════"
