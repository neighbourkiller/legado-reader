import { SourceTransportError, type SourceRequest, type SourceResponse, type SourceTransport } from './SourceTransport'

function transportError(cause: unknown): SourceTransportError {
  const message = String(cause)
  const kind = message.match(/kind=([a-z_]+)/i)?.[1]?.toUpperCase()
  const code = kind === 'TIMEOUT' ? 'REQUEST_TIMEOUT'
    : kind === 'DNS' ? 'DNS_RESOLUTION_FAILED'
      : kind === 'TLS' ? 'TLS_FAILED'
        : kind === 'CONNECT' ? 'CONNECTION_FAILED'
          : /\btimed out\b|\btimeout\b(?!\s*=\s*false\b)|\babort(?:ed)?\b/i.test(message) ? 'REQUEST_TIMEOUT'
            : /dns|lookup|name resolution/i.test(message) ? 'DNS_RESOLUTION_FAILED' : 'REQUEST_FAILED'
  return new SourceTransportError(code, message)
}

export class TauriTransport implements SourceTransport {
  async request(req: SourceRequest): Promise<SourceResponse> {
    const { invoke } = await import('@tauri-apps/api/core')

    let res
    try {
      res = await invoke<{
        status: number
        finalUrl: string
        headers: Record<string, string>
        body: number[]
        charset?: string
      }>('source_request', { request: req })
    } catch (cause) {
      throw transportError(cause)
    }

    return {
      ...res,
      body: new Uint8Array(res.body),
      channel: 'reqwest',
    }
  }

  async webviewFetch(req: SourceRequest): Promise<SourceResponse> {
    const { invoke } = await import('@tauri-apps/api/core')

    let res
    try {
      res = await invoke<{
        status: number
        finalUrl: string
        headers: Record<string, string>
        body: number[]
        charset?: string
      }>('webview_fetch', {
        request: {
          sourceId: req.sourceId,
          url: req.url,
          method: req.method,
          headers: req.headers,
          body: req.body,
          timeoutMs: req.timeout,
          delayMs: req.webViewDelayTime,
          followRedirects: req.followRedirects,
          useCookieJar: req.useCookieJar,
          responseType: req.responseType,
        },
      })
    } catch (cause) {
      throw transportError(cause)
    }

    return {
      ...res,
      body: new Uint8Array(res.body),
      channel: 'webview',
    }
  }

  async solveChallenge(sourceId: string, url: string, timeoutMs?: number): Promise<{
    success: boolean
    html?: string
    cookies: string[]
    requiresManualInteraction: boolean
  }> {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<{
      success: boolean
      html?: string
      cookies: string[]
      requiresManualInteraction: boolean
    }>('solve_webview_challenge', { sourceId, url, timeoutMs })
  }

  async syncWebviewCookies(sourceId: string, url: string): Promise<{
    cookieCount: number
    cookieNames: string[]
    hasCfClearance: boolean
  }> {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<{
      cookieCount: number
      cookieNames: string[]
      hasCfClearance: boolean
    }>('sync_webview_cookies', { sourceId, url })
  }

  async checkCfClearance(sourceId: string, url: string): Promise<boolean> {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<boolean>('check_cf_clearance', { sourceId, url })
  }

  async setCookies(sourceId: string, url: string, cookieStr: string, userAgent?: string): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('set_source_cookies', { sourceId, url, cookieStr, userAgent: userAgent || null })
  }

  async getCookies(sourceId: string, url: string): Promise<string> {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string>('get_source_cookies', { sourceId, url })
  }

  async openAuthWindow(sourceId: string, url: string, title?: string): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('open_source_auth_window', { sourceId, url, title })
  }

  async closeAuthWindow(sourceId: string): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('close_source_auth_window', { sourceId })
  }
}
