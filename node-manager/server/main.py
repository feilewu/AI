import sys
from pathlib import Path

BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

import json
import asyncio
import logging
import secrets
from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from jinja2 import Environment, FileSystemLoader

from config import load_config
from database import Database

config = load_config()
db = Database(config.db_path)

env = Environment(loader=FileSystemLoader(str(BASE_DIR / "templates")))

app = FastAPI(title="Node Manager")

static_dir = BASE_DIR / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

active_connections: dict[str, WebSocket] = {}
logger = logging.getLogger("node-manager")


# ── WebSocket: Agent 接入 ──────────────────────────────────────────────

@app.websocket("/ws/agent")
async def agent_websocket(ws: WebSocket):
    await ws.accept()
    node_id = None
    try:
        data = await ws.receive_json()
        if data.get("type") != "register":
            await ws.send_json({"error": "first message must be register"})
            await ws.close()
            return

        node_id = data["node_id"]
        token = data["token"]
        if not db.verify_node(node_id, token):
            await ws.send_json({"error": "invalid token"})
            await ws.close()
            return

        active_connections[node_id] = ws
        db.set_node_online(node_id)
        await ws.send_json({"type": "registered", "node_id": node_id})

        while True:
            msg = await ws.receive_json()
            msg_type = msg.get("type")

            if msg_type == "ping" or msg_type == "pong":
                if msg_type == "ping":
                    await ws.send_json({"type": "pong"})
                db.set_node_online(node_id)

            elif msg_type == "metrics":
                db.save_metrics(node_id, msg)
                db.set_node_online(node_id)

            elif msg_type == "cmd_result":
                db.update_command_result(
                    msg["cmd_id"], msg.get("result", ""), msg.get("exit_code", -1)
                )

            else:
                await ws.send_json({"error": f"unknown message type: {msg_type}"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.exception("ws error")
    finally:
        if node_id:
            active_connections.pop(node_id, None)
            db.set_node_offline(node_id)


# ── Helper: 下发命令到 Agent ──────────────────────────────────────────

async def dispatch_command(node_id: str, cmd_id: int, command: str) -> bool:
    ws = active_connections.get(node_id)
    if not ws:
        return False
    try:
        msg = json.dumps({"type": "exec", "cmd_id": cmd_id, "command": command})
        await ws.send_text(msg)
        return True
    except Exception:
        return False


# ── Web UI 页面 ────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def dashboard():
    nodes = db.get_nodes()
    for n in nodes:
        m = db.get_latest_metrics(n["id"])
        if m:
            n["cpu_pct"] = round(m["cpu_pct"], 1) if m["cpu_pct"] else None
            n["memory_pct"] = round(m["memory_pct"], 1) if m["memory_pct"] else None
            n["disk_pct"] = round(m["disk_pct"], 1) if m["disk_pct"] else None
    template = env.get_template("dashboard.html")
    return template.render(nodes=nodes)


@app.get("/nodes/{node_id}", response_class=HTMLResponse)
async def node_detail(node_id: str):
    node = db.get_node(node_id)
    if not node:
        return HTMLResponse("Node not found", status_code=404)
    latest = db.get_latest_metrics(node_id)
    history = db.get_metrics_history(node_id, limit=60)
    commands = db.get_node_commands(node_id, limit=20)
    template = env.get_template("node_detail.html")
    return template.render(node=node, latest=latest, history=history, commands=commands)


@app.get("/nodes/{node_id}/command", response_class=HTMLResponse)
async def node_command_page(node_id: str):
    node = db.get_node(node_id)
    if not node:
        return HTMLResponse("Node not found", status_code=404)
    history = db.get_node_commands(node_id, limit=50)
    template = env.get_template("node_command.html")
    return template.render(node=node, history=history)


@app.get("/nodes/{node_id}/logs", response_class=HTMLResponse)
async def node_logs_page(node_id: str):
    node = db.get_node(node_id)
    if not node:
        return HTMLResponse("Node not found", status_code=404)
    template = env.get_template("node_logs.html")
    return template.render(node=node)


@app.get("/nodes/{node_id}/logs/fetch", response_class=HTMLResponse)
async def node_logs_fetch(node_id: str, source: str = "", lines: int = 100):
    node = db.get_node(node_id)
    if not node:
        return HTMLResponse("Node not found", status_code=404)
    cmd_content = f"journalctl -n {lines} --no-pager"
    if source:
        cmd_content = f"journalctl -n {lines} -u {source} --no-pager"
    cmd_id = db.save_command(node_id, "log", cmd_content)
    ok = await dispatch_command(node_id, cmd_id, cmd_content)
    if not ok:
        return HTMLResponse("<pre class='log-output error'>节点离线，无法获取日志</pre>")
    await asyncio.sleep(1.5)
    cmd = db.get_command(cmd_id)
    output = cmd["result"] if cmd and cmd["result"] else "等待中..."
    return HTMLResponse(f"<pre class='log-output'>{output}</pre>")


@app.get("/manage", response_class=HTMLResponse)
async def manage_page():
    nodes = db.get_nodes()
    template = env.get_template("manage.html")
    return template.render(nodes=nodes)


# ── REST API ───────────────────────────────────────────────────────────

@app.get("/api/nodes")
async def api_nodes():
    nodes = db.get_nodes()
    return JSONResponse({"nodes": nodes})


@app.post("/api/nodes")
async def api_create_node(request: Request):
    data = await request.json()
    node_id = data.get("id") or f"node-{secrets.token_hex(4)}"
    name = data.get("name", node_id)
    token = data.get("token") or secrets.token_hex(16)
    db.register_node(node_id, name, token)
    return JSONResponse({"node_id": node_id, "token": token})


@app.delete("/api/nodes/{node_id}")
async def api_delete_node(node_id: str):
    ws = active_connections.pop(node_id, None)
    if ws:
        try:
            await ws.close()
        except Exception:
            pass
    db.delete_node(node_id)
    return JSONResponse({"status": "deleted"})


@app.post("/api/nodes/{node_id}/command")
async def api_send_command(node_id: str, request: Request):
    data = await request.json()
    cmd_type = data.get("type", "shell")
    cmd_content = data.get("command", "")
    if not cmd_content.strip():
        return JSONResponse({"error": "command is required"}, status_code=400)

    cmd_id = db.save_command(node_id, cmd_type, cmd_content)
    ok = await dispatch_command(node_id, cmd_id, cmd_content)

    is_htmx = request.headers.get("hx-request") == "true"
    if is_htmx:
        await asyncio.sleep(1.5)
        cmd = db.get_command(cmd_id)
        if cmd and cmd["result"]:
            html = f"<pre class='cmd-output'>$ {cmd_content}\n{cmd['result']}</pre>"
        elif ok:
            html = f"<pre class='cmd-output'>$ {cmd_content}\n<em>命令已发送，等待执行...</em></pre>"
        else:
            html = "<pre class='cmd-output error'>节点离线，无法执行命令</pre>"
        return HTMLResponse(html)

    return JSONResponse({"cmd_id": cmd_id, "dispatched": ok})


@app.get("/api/nodes/{node_id}/commands")
async def api_node_commands(node_id: str, limit: int = 50):
    cmds = db.get_node_commands(node_id, limit=limit)
    return JSONResponse({"commands": cmds})


@app.post("/api/nodes/{node_id}/regenerate-token")
async def api_regenerate_token(node_id: str):
    new_token = secrets.token_hex(16)
    db.update_token(node_id, new_token)
    ws = active_connections.pop(node_id, None)
    if ws:
        try:
            await ws.close()
        except Exception:
            pass
    return JSONResponse({"token": new_token})


# ── 后台任务 ───────────────────────────────────────────────────────────

async def check_stale_connections():
    while True:
        await asyncio.sleep(60)
        now = datetime.now(timezone.UTC)
        stale = []
        for nid, ws in list(active_connections.items()):
            try:
                node = db.get_node(nid)
                if node and node["last_seen"]:
                    last = datetime.fromisoformat(node["last_seen"])
                    if (now - last).total_seconds() > 120:
                        stale.append(nid)
                        await ws.close()
            except Exception:
                stale.append(nid)
        for nid in stale:
            active_connections.pop(nid, None)
            db.set_node_offline(nid)


@app.on_event("startup")
async def startup():
    asyncio.create_task(check_stale_connections())


def main():
    import uvicorn
    uvicorn.run(app, host=config.host, port=config.port)
