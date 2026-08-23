import type { SourceRequest, SourceResponse, SourceTransport } from './SourceTransport'

export class TauriTransport implements SourceTransport {
  async request(req: SourceRequest): Promise<SourceResponse> {
    const { invoke } = await import('@tauri-apps/api/core')

    const res = await invoke<{
      status: number
      finalUrl: string
      headers: Record<string, string>
      body: number[]
      charset?: string
    }>('source_request', { request: req })

    return {
      ...res,
      body: new Uint8Array(res.body),
      channel: 'reqwest',
    }
  }

  async webviewFetch(req: SourceRequest): Promise<SourceResponse> {
    const { invoke } = await import('@tauri-apps/api/core')

    const res = await invoke<{
      status: number
      finalUrl: string
      headers: Record<string, string>
      body: number[]
      charset?: string
    }>('webview_fetch', {
      sourceId: req.sourceId,
      url: req.url,
      method: req.method,
      headers: req.headers,
      body: req.body,
      timeoutMs: req.timeout,
    })

    return {
      ...res,
      body: new Uint8Array(res.body),
      channel: 'webview',
    }
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
