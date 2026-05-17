import re

from fastapi import Request
from fastapi.responses import Response, StreamingResponse
import httpx


def _rewrite_html(html: str, prefix: str) -> str:
    """改写 HTML 中的绝对路径引用，加上服务前缀"""
    prefix = prefix.rstrip("/")
    html = re.sub(
        r'(href|src|action|hx-get|hx-post|hx-put|hx-patch|hx-delete)=(["\'])/(?!/)',
        rf'\1=\2{prefix}/',
        html,
    )
    html = re.sub(
        r'(url\(["\']?)/(?!/)',
        rf'\1{prefix}/',
        html,
    )
    return html


async def proxy_request(request: Request, target_host: str, target_port: int, prefix: str):
    path = request.url.path
    query = request.url.query
    target_path = path[len(prefix):] if path.startswith(prefix) else path
    if not target_path.startswith("/"):
        target_path = "/" + target_path
    if query:
        target_path += f"?{query}"

    url = f"http://{target_host}:{target_port}{target_path}"

    headers = dict(request.headers)
    headers.pop("host", None)

    body = await request.body()

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.request(
                method=request.method,
                url=url,
                headers=headers,
                content=body,
                timeout=30,
            )
        except httpx.RequestError as e:
            return StreamingResponse(
                content=[f"Proxy error: {e}".encode()],
                status_code=502,
                media_type="text/plain",
            )

    response_headers = dict(resp.headers)
    response_headers.pop("content-encoding", None)
    response_headers.pop("transfer-encoding", None)
    response_headers.pop("content-length", None)

    content_type = resp.headers.get("content-type", "")
    if "text/html" in content_type:
        body = await resp.aread()
        html = body.decode("utf-8", errors="replace")
        html = _rewrite_html(html, prefix)
        body = html.encode("utf-8")
        response_headers["content-length"] = str(len(body))
        return Response(
            content=body,
            status_code=resp.status_code,
            headers=response_headers,
            media_type=content_type,
        )

    return StreamingResponse(
        content=resp.aiter_bytes(),
        status_code=resp.status_code,
        headers=response_headers,
        media_type=content_type,
    )
