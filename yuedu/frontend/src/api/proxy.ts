export interface ProxyOptions {
  url: string
  headers?: Record<string, string>
  method: string
  body?: string
}

export function parseYueduUrl(input: string, defaultHeaders?: Record<string, string>): ProxyOptions {
  let url = input
  let method = 'GET'
  let body: string | undefined
  let headers: Record<string, string> = { ...defaultHeaders }

  const commaDictMatch = url.match(/^(.*?),(\{.*)$/)
  if (commaDictMatch) {
    url = commaDictMatch[1].trim()
    try {
      const dictStr = commaDictMatch[2]
        .replace(/'/g, '"')
        .replace(/(\w+):/g, '"$1":')
      const opts = JSON.parse(dictStr)
      method = (opts.method || 'GET').toUpperCase()
      body = opts.body
      if (opts.headers) {
        headers = { ...headers, ...opts.headers }
      }
      if (opts.charset) {
        headers['charset'] = opts.charset
      }
    } catch {}
  }

  if (url.includes('##') && /##\//.test(url)) {
    url = url.replace(/##\//g, '/')
  }

  return { url, headers, method, body }
}

export async function proxyFetch(
  rawUrl: string,
  headers?: Record<string, string>,
  method: string = 'GET',
  body?: string
): Promise<{ body: string; status: number; headers: Record<string, string> }> {
  const { url, method: parsedMethod, body: parsedBody, headers: mergedHeaders } = parseYueduUrl(rawUrl, headers)

  const res = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      headers: mergedHeaders,
      method: method !== 'GET' ? method : parsedMethod,
      body: body || parsedBody,
    }),
  })
  if (!res.ok) {
    throw new Error(`Proxy error: ${res.status} ${res.statusText}`)
  }
  return res.json()
}
