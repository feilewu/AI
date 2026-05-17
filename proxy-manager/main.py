import sys
from pathlib import Path

BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

import asyncio
import hmac
import logging
import secrets
import time
from urllib.parse import quote
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from jinja2 import Environment, FileSystemLoader

from config import load_config
from database import Database
from proxy import proxy_request
from scanner import scan_ports

config = load_config()
db = Database(config.db_path)

env = Environment(loader=FileSystemLoader(str(BASE_DIR / "templates")))

app = FastAPI(title="Proxy Manager")
logger = logging.getLogger("proxy-manager")

static_dir = BASE_DIR / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


# ── Auth ──────────────────────────────────────────────────────────────

COOKIE_NAME = "proxy_session"
SESSION_DURATION = 86400


def _sign_session() -> str:
    expiry = int(time.time()) + SESSION_DURATION
    data = f"admin:{expiry}"
    sig = hmac.new(config.secret_key.encode(), data.encode(), "sha256").hexdigest()
    return f"{data}.{sig}"


def _verify_session(cookie: str) -> bool:
    if "." not in cookie:
        return False
    data, sig = cookie.rsplit(".", 1)
    expected = hmac.new(config.secret_key.encode(), data.encode(), "sha256").hexdigest()
    if not hmac.compare_digest(sig, expected):
        return False
    try:
        _, expiry = data.split(":", 1)
        return int(time.time()) <= int(expiry)
    except (ValueError, IndexError):
        return False


def _is_authenticated(request: Request) -> bool:
    if not config.auth_password:
        return True
    cookie = request.cookies.get(COOKIE_NAME)
    return bool(cookie and _verify_session(cookie))


def _login_url(request: Request) -> str:
    return f"/login?next={quote(request.url.path)}"


def _check_auth(request: Request) -> HTMLResponse | RedirectResponse | None:
    if _is_authenticated(request):
        return None
    if request.headers.get("HX-Request") == "true":
        return HTMLResponse("", headers={"HX-Redirect": _login_url(request)})
    return RedirectResponse(url=_login_url(request))


@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    if _is_authenticated(request):
        next_url = request.query_params.get("next", "")
        if next_url:
            return RedirectResponse(url=next_url, status_code=302)
        return RedirectResponse(url="/", status_code=302)
    error = request.query_params.get("error", "")
    next_url = request.query_params.get("next", "")
    template = env.get_template("login.html")
    return template.render(error=error, next=next_url)


@app.post("/login")
async def login_submit(request: Request):
    data = await request.form()
    password = data.get("password", "")
    next_url = data.get("next", "")
    if password == config.auth_password:
        dest = next_url if next_url else "/"
        resp = RedirectResponse(url=dest, status_code=302)
        resp.set_cookie(
            key=COOKIE_NAME, value=_sign_session(), max_age=SESSION_DURATION,
            httponly=True, samesite="lax",
        )
        return resp
    error_url = "/login?error=1"
    if next_url:
        error_url += f"&next={quote(next_url)}"
    return RedirectResponse(url=error_url, status_code=302)


@app.get("/logout")
async def logout():
    resp = RedirectResponse(url="/", status_code=302)
    resp.delete_cookie(key=COOKIE_NAME)
    return resp


# ── Proxy Middleware ──────────────────────────────────────────────────

def _match_protected_path(relative_path: str, patterns: str) -> bool:
    if not patterns:
        return False
    for p in patterns.split(","):
        p = p.strip()
        if not p:
            continue
        if p.endswith("*"):
            prefix = p[:-1]
            if relative_path == prefix or relative_path.startswith(prefix):
                return True
        else:
            if relative_path == p:
                return True
    return False


@app.middleware("http")
async def proxy_middleware(request: Request, call_next):
    path = request.url.path
    if path.startswith("/static/"):
        return await call_next(request)

    services = db.get_enabled_services()
    for svc in services:
        prefix = f"/{svc['path_prefix']}"
        if path == prefix or path.startswith(prefix + "/"):
            protected = svc.get("protected_paths", "")
            if protected:
                relative_path = path[len(prefix):] if path != prefix else "/"
                if _match_protected_path(relative_path, protected):
                    if resp := _check_auth(request):
                        return resp
            return await proxy_request(request, svc["target_host"], svc["target_port"], prefix)

    return await call_next(request)


# ── Helper ────────────────────────────────────────────────────────────

def _external_services() -> list[dict]:
    """返回非代理自身的服务列表（过滤掉指向自身端口的）"""
    return [s for s in db.list_services() if s["target_port"] != config.port]


# ── Web UI ────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    services = _external_services()
    authenticated = _is_authenticated(request)
    template = env.get_template("dashboard.html")
    return template.render(services=services, authenticated=authenticated)


# ── REST API ──────────────────────────────────────────────────────────

@app.get("/api/services")
async def api_list_services():
    services = _external_services()
    return JSONResponse({"services": services})


@app.post("/api/services")
async def api_add_service(request: Request):
    if resp := _check_auth(request):
        return resp
    data = await request.form()
    name = data.get("name", "").strip()
    path_prefix = data.get("path_prefix", "").strip()
    target_port = data.get("target_port")
    target_host = data.get("target_host", "localhost")
    auto_detected = data.get("auto_detected", "false") in ("true", "True", "1")
    protected_paths = data.get("protected_paths", "").strip()

    if not name or not path_prefix or not target_port:
        if request.headers.get("HX-Request") == "true":
            return HTMLResponse("<p class='muted'>请填写所有必填字段</p>")
        return JSONResponse({"error": "name, path_prefix, target_port are required"}, status_code=400)

    try:
        target_port = int(target_port)
    except (TypeError, ValueError):
        if request.headers.get("HX-Request") == "true":
            return HTMLResponse("<p class='muted'>端口必须是数字</p>")
        return JSONResponse({"error": "target_port must be an integer"}, status_code=400)

    existing = db.list_services()
    for s in existing:
        if s["path_prefix"] == path_prefix:
            if request.headers.get("HX-Request") == "true":
                return HTMLResponse(f"<p class='muted'>路径前缀 '{path_prefix}' 已存在</p>")
            return JSONResponse({"error": f"path_prefix '{path_prefix}' already exists"}, status_code=409)

    svc_id = db.add_service(name, path_prefix, target_port, target_host, auto_detected, protected_paths)

    if request.headers.get("HX-Request") == "true":
        template = env.get_template("service_list.html")
        html = template.render(services=_external_services())
        if auto_detected:
            html += f'\n<div id="scan-{target_port}" hx-swap-oob="delete"></div>'
        return HTMLResponse(html)

    return JSONResponse({"id": svc_id})


def _render_mgmt():
    template = env.get_template("service_mgmt.html")
    return HTMLResponse(template.render(services=_external_services()))


@app.get("/api/services/cards")
async def api_services_cards():
    template = env.get_template("service_list.html")
    return HTMLResponse(template.render(services=_external_services()))


@app.get("/api/services/mgmt")
async def api_mgmt_view(request: Request):
    if resp := _check_auth(request):
        return resp
    services = _external_services()
    template = env.get_template("service_mgmt.html")
    return HTMLResponse(template.render(services=services))


@app.post("/api/services/mgmt/add")
async def api_mgmt_add(request: Request):
    if resp := _check_auth(request):
        return resp
    data = await request.form()
    name = data.get("name", "").strip()
    path_prefix = data.get("path_prefix", "").strip()
    target_port = data.get("target_port")
    target_host = data.get("target_host", "localhost")
    protected_paths = data.get("protected_paths", "").strip()
    try:
        target_port = int(target_port)
    except (TypeError, ValueError):
        return HTMLResponse("<p class='muted'>端口必须是数字</p>")
    if not name or not path_prefix:
        return HTMLResponse("<p class='muted'>名称和路径前缀不能为空</p>")
    db.add_service(name, path_prefix, target_port, target_host, protected_paths=protected_paths)
    return _render_mgmt()


@app.delete("/api/services/mgmt/{service_id}")
async def api_mgmt_delete(request: Request, service_id: int):
    if resp := _check_auth(request):
        return resp
    db.delete_service(service_id)
    return _render_mgmt()


@app.put("/api/services/mgmt/{service_id}")
async def api_mgmt_update(request: Request, service_id: int):
    if resp := _check_auth(request):
        return resp
    data = await request.form()
    kwargs = {}
    for key in ("name", "path_prefix", "target_host", "target_port", "enabled", "protected_paths"):
        val = data.get(key)
        if val is not None:
            kwargs[key] = val
    if "target_port" in kwargs:
        try:
            kwargs["target_port"] = int(kwargs["target_port"])
        except (TypeError, ValueError):
            return HTMLResponse("<p class='muted'>端口必须是数字</p>")
    db.update_service(service_id, **kwargs)
    return _render_mgmt()


@app.get("/api/services/mgmt/{service_id}/edit")
async def api_mgmt_edit_row(request: Request, service_id: int):
    if resp := _check_auth(request):
        return resp
    svc = db.get_service(service_id)
    if not svc:
        return HTMLResponse("<p class='muted'>服务不存在</p>")
    template = env.get_template("service_row_edit.html")
    return HTMLResponse(template.render(svc=svc))


_scan_in_progress = False
_scan_result: list[dict] | None = None


@app.get("/api/services/scan")
async def api_scan(request: Request):
    if resp := _check_auth(request):
        return resp
    global _scan_in_progress, _scan_result

    if not _scan_in_progress and _scan_result is None:
        services = db.list_services()
        existing_ports = {s["target_port"] for s in services}

        async def _run():
            global _scan_in_progress, _scan_result
            try:
                _scan_result = await scan_ports(exclude_ports=existing_ports | {config.port})
            finally:
                _scan_in_progress = False

        _scan_in_progress = True
        _scan_result = None
        asyncio.create_task(_run())

    if request.headers.get("HX-Request") == "true":
        return HTMLResponse("""
        <div id="scan-results" hx-trigger="every 2s" hx-get="/api/services/scan/poll" hx-swap="outerHTML">
            <p class="muted">扫描中...</p>
        </div>
        """)

    return HTMLResponse("<p class='muted'>扫描中...</p>")


@app.get("/api/services/scan/poll")
async def api_scan_poll(request: Request):
    if resp := _check_auth(request):
        return resp
    global _scan_in_progress, _scan_result

    if _scan_in_progress or _scan_result is None:
        return HTMLResponse("""
        <div id="scan-results" hx-trigger="every 2s" hx-get="/api/services/scan/poll" hx-swap="outerHTML">
            <p class="muted">扫描中...</p>
        </div>
        """)

    result = _scan_result
    _scan_in_progress = False
    _scan_result = None

    if request.headers.get("HX-Request") == "true":
        template = env.get_template("scan_results.html")
        return HTMLResponse(template.render(detected=result))

    return JSONResponse({"detected": result})


@app.get("/api/services/{service_id}")
async def api_get_service_card(request: Request, service_id: int):
    svc = db.get_service(service_id)
    if not svc:
        return JSONResponse({"error": "not found"}, status_code=404)
    if request.headers.get("HX-Request") == "true" or "text/html" in request.headers.get("Accept", ""):
        template = env.get_template("service_list.html")
        return HTMLResponse(template.render(services=[svc]))
    return JSONResponse(svc)


@app.get("/api/services/{service_id}/edit")
async def api_edit_service_form(request: Request, service_id: int):
    if resp := _check_auth(request):
        return resp
    svc = db.get_service(service_id)
    if not svc:
        return HTMLResponse("<p class='muted'>服务不存在</p>")
    template = env.get_template("service_edit.html")
    return HTMLResponse(template.render(svc=svc))


@app.put("/api/services/{service_id}")
async def api_update_service(request: Request, service_id: int):
    if resp := _check_auth(request):
        return resp
    data = await request.form()
    kwargs = {}
    for key in ("name", "path_prefix", "target_host", "target_port", "enabled", "protected_paths"):
        val = data.get(key)
        if val is not None:
            kwargs[key] = val
    if "target_port" in kwargs:
        try:
            kwargs["target_port"] = int(kwargs["target_port"])
        except (TypeError, ValueError):
            if request.headers.get("HX-Request") == "true":
                return HTMLResponse("<p class='muted'>端口必须是数字</p>")
            return JSONResponse({"error": "target_port must be an integer"}, status_code=400)
    if "enabled" in kwargs:
        kwargs["enabled"] = kwargs["enabled"] in ("true", "True", "1")
    ok = db.update_service(service_id, **kwargs)
    if not ok:
        if request.headers.get("HX-Request") == "true":
            return HTMLResponse("<p class='muted'>服务不存在</p>")
        return JSONResponse({"error": "service not found"}, status_code=404)
    if request.headers.get("HX-Request") == "true":
        template = env.get_template("service_list.html")
        return HTMLResponse(template.render(services=[db.get_service(service_id)]))
    return JSONResponse({"status": "updated"})


@app.delete("/api/services/{service_id}")
async def api_delete_service(request: Request, service_id: int):
    if resp := _check_auth(request):
        return resp
    svc = db.get_service(service_id)
    if not svc:
        if request.headers.get("HX-Request") == "true":
            return HTMLResponse("<p class='muted'>服务不存在</p>")
        return JSONResponse({"error": "not found"}, status_code=404)
    db.delete_service(service_id)

    if request.headers.get("HX-Request") == "true":
        return HTMLResponse(" ")

    return JSONResponse({"status": "deleted"})


def main():
    import uvicorn
    uvicorn.run(app, host=config.host, port=config.port)

if __name__ == "__main__":
    main()
