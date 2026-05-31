import { CookieJar } from 'tough-cookie'

const cookieJars = new Map<string, CookieJar>()

function getCookieJar(url: string): CookieJar {
  const domain = new URL(url).hostname
  if (!cookieJars.has(domain)) {
    cookieJars.set(domain, new CookieJar())
  }
  return cookieJars.get(domain)!
}

export async function proxyHandler(ctx: import('koa').Context): Promise<void> {
  const { url, headers, method, body } = ctx.request.body as {
    url: string
    headers?: Record<string, string>
    method?: string
    body?: string
  }

  if (!url) {
    ctx.status = 400
    ctx.body = { error: 'url is required' }
    return
  }

  const cookieJar = getCookieJar(url)
  const cookieHeader = await cookieJar.getCookieString(url)

  const fetchHeaders: Record<string, string> = {
    ...headers,
  }

  if (cookieHeader) {
    fetchHeaders['Cookie'] = cookieHeader
  }

  console.log(`[proxy] ${method ?? 'GET'} ${url}`)

  const fetchOptions: RequestInit = {
    method: method ?? 'GET',
    headers: fetchHeaders,
  }

  if (body && method?.toUpperCase() !== 'GET') {
    fetchOptions.body = body
  }

  const response = await fetch(url, fetchOptions)

  const setCookieHeaders = response.headers.getSetCookie?.()
  if (setCookieHeaders && setCookieHeaders.length > 0) {
    for (const cookie of setCookieHeaders) {
      await cookieJar.setCookie(cookie, url)
    }
  } else {
    const singleSetCookie = response.headers.get('set-cookie')
    if (singleSetCookie) {
      await cookieJar.setCookie(singleSetCookie, url)
    }
  }

  const responseHeaders: Record<string, string> = {}
  for (const [key, value] of response.headers.entries()) {
    responseHeaders[key] = value
  }

  const responseBody = await response.text()

  ctx.status = response.status
  ctx.body = {
    body: responseBody,
    status: response.status,
    headers: responseHeaders,
  }
}
