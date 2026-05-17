import asyncio
import re
import httpx


async def scan_ports(exclude_ports: set[int] = None) -> list[dict]:
    exclude = set(exclude_ports or [])

    proc = await asyncio.create_subprocess_exec(
        "ss", "-tlnp",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()

    ports = set()
    for line in stdout.decode().splitlines():
        m = re.search(r":(\d+)\s", line)
        if m:
            port = int(m.group(1))
            if port not in exclude:
                ports.add(port)

    detected = []
    for port in sorted(ports):
        service = await _probe_port(port)
        if service:
            detected.append(service)

    return detected


async def _probe_port(port: int) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            resp = await client.get(f"http://localhost:{port}/")
            if resp.status_code < 500:
                server = resp.headers.get("server", "")
                ct = resp.headers.get("content-type", "")
                name = _guess_name(port, server) or f"service-{port}"
                return {
                    "port": port,
                    "name": name,
                    "server": server,
                    "content_type": ct,
                    "status": resp.status_code,
                }
    except (httpx.RequestError, httpx.TimeoutException):
        pass
    return None


def _guess_name(port: int, server: str) -> str | None:
    server_lower = server.lower()
    if "nginx" in server_lower:
        return "nginx"
    if "apache" in server_lower or "httpd" in server_lower:
        return "apache"
    if "caddy" in server_lower:
        return "caddy"
    if "node" in server_lower or "express" in server_lower:
        return f"node-app-{port}"
    if "python" in server_lower:
        return f"python-app-{port}"
    return None
