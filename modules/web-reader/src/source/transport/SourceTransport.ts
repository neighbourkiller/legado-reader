export interface SourceRequest {
  sourceId: string
  url: string
  method: 'GET' | 'POST' | 'HEAD'
  headers?: Record<string, string>
  body?: string
  charset?: string
  timeout?: number
  retry?: number
  followRedirects?: boolean
  useCookieJar?: boolean
  useWebView?: boolean
  webViewDelayTime?: number
  dnsIp?: string
  origin?: string
  responseType?: 'text' | 'binary' | 'hex'
  webJs?: string
  bodyJs?: string
}

export interface SourceResponse {
  status: number
  finalUrl: string
  headers: Record<string, string>
  body: Uint8Array
  charset?: string
  /** 请求通道标识 */
  channel?: 'reqwest' | 'webview'
}

export class SourceTransportError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'SourceTransportError'
  }
}

/** Cloudflare 诊断信息 */
export interface CfDiagnostics {
  isChallenge: boolean
  cfRay?: string
  cfMitigated?: string
}

export interface SolveChallengeResponse {
  success: boolean
  html?: string
  cookies: string[]
  requiresManualInteraction: boolean
}

export interface SourceTransport {
  request(req: SourceRequest): Promise<SourceResponse>

  /** 通过 WebView 发起请求（共享浏览器会话、Cookie、指纹） */
  webviewFetch?(req: SourceRequest): Promise<SourceResponse>

  /** 后台隐藏 WebView 自动导航目标 URL 解决 JS 挑战盾 */
  solveChallenge?(sourceId: string, url: string, timeoutMs?: number): Promise<SolveChallengeResponse>

  /** 自动从 WebView 验证窗口同步 Cookie 到 reqwest CookieJar */
  syncWebviewCookies?(sourceId: string, url: string): Promise<{
    cookieCount: number
    cookieNames: string[]
    hasCfClearance: boolean
  }>

  /** 检查 WebView 是否已通过 Cloudflare 验证（存在 cf_clearance cookie） */
  checkCfClearance?(sourceId: string, url: string): Promise<boolean>

  setCookies?(sourceId: string, url: string, cookieStr: string, userAgent?: string): Promise<void>
  getCookies?(sourceId: string, url: string): Promise<string>
  openAuthWindow?(sourceId: string, url: string, title?: string): Promise<void>
  closeAuthWindow?(sourceId: string): Promise<void>
}
