import type { EngineContext } from '@/types'
import sandboxHTML from './sandbox-frame.html?raw'

const EXECUTION_TIMEOUT = 5000

let sandboxIframe: HTMLIFrameElement | null = null
let sandboxLoading: Promise<HTMLIFrameElement> | null = null

interface PendingRequest {
  resolve: (value: any) => void
  reject: (reason: any) => void
  timeout: ReturnType<typeof setTimeout>
}

let nextId = 0
const pending = new Map<string, PendingRequest>()

function handleMessage(e: MessageEvent) {
  if (!sandboxIframe || e.source !== sandboxIframe.contentWindow) return

  const { type, id, data, error } = e.data
  if (!id || !pending.has(id)) return

  const p = pending.get(id)!
  clearTimeout(p.timeout)
  pending.delete(id)

  if (type === 'result') {
    p.resolve(data)
  } else if (type === 'error') {
    p.reject(new Error(error))
  }
}

function getSandbox(): Promise<HTMLIFrameElement> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('JS sandbox requires browser environment'))
  }

  if (sandboxIframe) {
    return Promise.resolve(sandboxIframe)
  }

  if (!sandboxLoading) {
    sandboxLoading = new Promise<HTMLIFrameElement>((resolve) => {
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.sandbox = 'allow-scripts'
      iframe.srcdoc = sandboxHTML
      iframe.onload = () => {
        sandboxIframe = iframe
        resolve(iframe)
      }
      document.body.appendChild(iframe)
    })

    window.addEventListener('message', handleMessage)
  }

  return sandboxLoading
}

export function executeJS(script: string, ctx: EngineContext): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = String(++nextId)
    let settled = false

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      pending.delete(id)
      reject(new Error('JS execution timeout (5s)'))
    }, EXECUTION_TIMEOUT)

    pending.set(id, {
      resolve: (value: any) => {
        if (settled) return
        settled = true
        resolve(value)
      },
      reject: (reason: any) => {
        if (settled) return
        settled = true
        reject(reason)
      },
      timeout,
    })

    getSandbox().then((iframe) => {
      iframe.contentWindow?.postMessage({
        type: 'execute',
        id,
        script,
        context: ctx,
      }, '*')
    }).catch(reject)
  })
}

export function extractJS(raw: string): string {
  const match = raw.match(/<js>([\s\S]*?)<\/js>/)
  return match ? match[1].trim() : raw
}

export function stripJSMarker(raw: string): string {
  return raw.replace(/^@js:/, '').trim()
}

export function hexDecodeToString(data: string): string {
  const pairs = data.match(/.{1,2}/g)
  if (!pairs) return ''
  return pairs.map(p => String.fromCharCode(parseInt(p, 16))).join('')
}
