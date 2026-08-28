import type { BookSource, OnlineChapterPayload, SearchResult, SearchRule } from '@/source/types/BookSource'
import { getTransport } from '@/source/transport'
import type { SourceRequest, SourceResponse, CfDiagnostics } from '@/source/transport/SourceTransport'
import { parseSearchResults } from './SearchParser'
import { parseBookInfo, type BookInfo } from './BookInfoParser'
import { parseToc, type TocItem } from './TocParser'
import { parseContent, parseImageContent, type ContentResult } from './ContentParser'
import { applyTextReplaceRule, parseString, parseStringAsync, resolveAbsoluteUrl } from './RuleParser'
import { RuleExecutionError, type RuleExecutionContext } from './RuleTypes'
import { executeSourceJavaScript, executeSourceWebJavaScript } from '@/platform/sourceScripts'
import { saveBookSource } from '@/storage/db'

export function decodeResponse(body: Uint8Array, charset: string = 'utf-8'): string {
  try {
    const decoder = new TextDecoder(charset)
    return decoder.decode(body)
  } catch {
    const error = new Error(`不支持或无法解码响应字符集: ${charset}`)
    error.name = 'RESPONSE_ENCODING_ERROR'
    throw error
  }
}

export type { CfDiagnostics } from '@/source/transport/SourceTransport'

export type ChallengeType = 'cloudflare' | 'browser_challenge' | 'captcha' | 'waf'

export interface SecurityDiagnostics {
  isChallenge: boolean
  type?: ChallengeType
  title?: string
  snippet?: string
  cfRay?: string
  cfMitigated?: string
}

/** 启发式检测页面是否为防爬验证/浏览器质询拦截页 */
export function detectSecurityChallenge(html: string, response?: SourceResponse): SecurityDiagnostics {
  const lowerHtml = (html || '').toLowerCase()
  const snippet = (html || '').trim().slice(0, 300)

  // 1. Cloudflare 检测 (支持 HTTP 403 / 503 或含有 Cloudflare 特征头/特征串)
  let cfRay: string | undefined
  let cfMitigated: string | undefined
  let isCloudflare = false

  if (response) {
    const getHeader = (name: string) =>
      Object.entries(response.headers).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1]
    const server = getHeader('server')
    cfRay = getHeader('cf-ray')
    cfMitigated = getHeader('cf-mitigated')
    isCloudflare = server?.toLowerCase().includes('cloudflare') ?? Boolean(cfRay || cfMitigated)
  }

  const cfMarkers = [
    'just a moment',
    'attention required',
    'sorry, you have been blocked',
    'cf-mitigated',
    '/cdn-cgi/challenge-platform/',
    '__cf_chl_',
  ]
  const hasCfMarker = cfMarkers.some(marker => lowerHtml.includes(marker))

  if ((response && (response.status === 403 || response.status === 503) && isCloudflare && hasCfMarker) || (isCloudflare && hasCfMarker)) {
    return {
      isChallenge: true,
      type: 'cloudflare',
      title: 'Cloudflare 浏览器访问质询',
      snippet,
      cfRay,
      cfMitigated,
    }
  }

  // 2. 前端 JavaScript 浏览器质询 (例如 ixdzs8、5秒盾、自建 WAF 挑战)
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const pageTitle = titleMatch ? titleMatch[1].trim() : ''

  const challengeTitleKeywords = [
    '正在验证浏览器',
    '安全验证',
    '系统安全验证',
    '浏览器安全检查',
    '安全检查中',
    'checking your browser',
    'just a moment',
    'attention required',
    'please wait',
    'ddos protection',
    '人机安全验证',
  ]
  const titleMatches = challengeTitleKeywords.some(kw => pageTitle.toLowerCase().includes(kw))

  const challengeBodyKeywords = [
    '正在進行安全驗證',
    '正在进行安全验证',
    '請稍等，正在進行安全驗證',
    '请稍等，正在进行安全验证',
    'checking your browser before accessing',
    'ddos protection by',
    'location.pathname + "?challenge="',
    'location.href = location.pathname + "?challenge="',
    '?challenge=',
    'waf-verify',
  ]
  const bodyMatches = challengeBodyKeywords.some(kw => html.includes(kw) || lowerHtml.includes(kw.toLowerCase()))

  const isShortPage = html.length < 4000

  if ((titleMatches && (bodyMatches || isShortPage)) || (bodyMatches && isShortPage)) {
    return {
      isChallenge: true,
      type: 'browser_challenge',
      title: pageTitle || '前端浏览器安全质询',
      snippet,
    }
  }

  // 3. 滑块 / 极验 / 人机验证码页面 (Captcha / WAF)
  const captchaKeywords = [
    '滑动验证',
    '人机安全验证',
    '点击完成验证',
    'geetest',
    '极验',
    '请输入验证码',
  ]
  const hasCaptcha = captchaKeywords.some(kw => html.includes(kw))
  if (hasCaptcha && isShortPage) {
    return {
      isChallenge: true,
      type: 'captcha',
      title: pageTitle || '人机验证码拦截',
      snippet,
    }
  }

  return { isChallenge: false }
}

/** 从响应中提取 Cloudflare 诊断信息（保持向后兼容） */
export function extractCfDiagnostics(response: SourceResponse): CfDiagnostics {
  const result = detectSecurityChallenge(decodeResponse(response.body, response.charset || 'utf-8'), response)
  return {
    isChallenge: result.isChallenge && result.type === 'cloudflare',
    cfRay: result.cfRay,
    cfMitigated: result.cfMitigated,
  }
}

/** 通用安全验证挑战错误，携带诊断信息和原始响应 */
export class SecurityChallengeError extends Error {
  readonly diagnostics: SecurityDiagnostics
  readonly response?: SourceResponse

  constructor(message: string, diagnostics: SecurityDiagnostics, response?: SourceResponse) {
    super(message)
    this.name = 'SecurityChallengeError'
    this.diagnostics = diagnostics
    this.response = response
  }
}

/** Cloudflare 验证挑战错误，继承自 SecurityChallengeError 保持向后兼容 */
export class CloudflareChallengeError extends SecurityChallengeError {
  constructor(message: string, response: SourceResponse, diagnostics: CfDiagnostics) {
    super(message, {
      isChallenge: diagnostics.isChallenge,
      type: 'cloudflare',
      title: 'Cloudflare 访问验证',
      cfRay: diagnostics.cfRay,
      cfMitigated: diagnostics.cfMitigated,
      snippet: decodeResponse(response.body, response.charset || 'utf-8').trim().slice(0, 300),
    }, response)
    this.name = 'CloudflareChallengeError'
  }
}

function createHttpError(response: SourceResponse, fallbackMessage: string): Error {
  const html = decodeResponse(response.body, response.charset || 'utf-8')
  const challenge = detectSecurityChallenge(html, response)
  if (challenge.isChallenge) {
    if (challenge.type === 'cloudflare') {
      return new CloudflareChallengeError(
        '目标网站触发 Cloudflare 浏览器访问验证（HTTP 403）。请启用 WebView 通道或先完成网页验证。',
        response,
        { isChallenge: true, cfRay: challenge.cfRay, cfMitigated: challenge.cfMitigated },
      )
    }
    return new SecurityChallengeError(
      `目标网站触发安全访问验证（${challenge.title}）。请启用 WebView 通道或先完成网页验证。`,
      challenge,
      response,
    )
  }

  const error = new Error(fallbackMessage) as Error & { code: string; status: number }
  error.name = 'SourceHttpError'
  error.code = 'HTTP_ERROR'
  error.status = response.status
  return error
}

export interface ParsedSearchRequest {
  url: string
  method: 'GET' | 'POST' | 'HEAD'
  body?: string
  headers?: Record<string, string>
  charset?: string
  retry?: number
  timeout?: number
  followRedirects?: boolean
  useCookieJar?: boolean
  useWebView?: boolean
  webViewDelayTime?: number
  dnsIp?: string
  origin?: string
  responseType?: 'text' | 'binary' | 'hex'
  urlJs?: string
  webJs?: string
  bodyJs?: string
}

const rateRecords = new Map<string, { time: number; accessLimit: number; interval: number; frequency: number }>()

async function waitForConcurrentRate(source: BookSource): Promise<void> {
  const raw = source.concurrentRate?.trim()
  if (!raw || raw === '0') return
  const [limitRaw, intervalRaw] = raw.includes('/') ? raw.split('/', 2) : ['1', raw]
  const accessLimit = Number.parseInt(limitRaw, 10)
  const interval = Number.parseInt(intervalRaw, 10)
  if (accessLimit <= 0 || interval <= 0) return
  const key = source.bookSourceUrl
  while (true) {
    const now = Date.now()
    const record = rateRecords.get(key)
    if (!record || now >= record.time + record.interval) {
      rateRecords.set(key, { time: now, accessLimit, interval, frequency: 1 })
      return
    }
    record.accessLimit = accessLimit
    record.interval = interval
    if (record.frequency < accessLimit) {
      record.frequency += 1
      return
    }
    await new Promise(resolve => setTimeout(resolve, Math.max(1, record.time + record.interval - now)))
  }
}

function selectPageCandidate(value: string, page: number): string {
  return value.replace(/<([^<>]+)>/g, (_match, candidates: string) => {
    const values = candidates.split(',').map(item => item.trim())
    return values[Math.min(Math.max(page, 1) - 1, values.length - 1)] || ''
  })
}

function parseBooleanOption(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  if (typeof value === 'string' && value.trim().toLowerCase() === 'true') return true
  if (typeof value === 'string' && value.trim().toLowerCase() === 'false') return false
  return undefined
}

export function getDefaultUserAgent(): string {
  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    return navigator.userAgent
  }
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

export function getSourceHeaders(source: BookSource, refererUrl?: string): Record<string, string> {
  // 仅设置基础 headers，不伪装 Sec-CH-UA / Sec-Fetch-* 等浏览器特有头
  // 这些 Client Hints 和 Sec-Fetch 头应由真实浏览器生成，reqwest 冒充反而增加被检测为爬虫的风险
  const headers: Record<string, string> = {
    'User-Agent': getDefaultUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': refererUrl || source.bookSourceUrl,
  }

  if (source.header) {
    try {
      const customHeader =
        typeof source.header === 'string' ? JSON.parse(source.header) : source.header
      Object.assign(headers, customHeader)
    } catch (cause) {
      console.warn(`[SourceEngine] 书源 Header 解析失败: ${source.bookSourceName}`, cause)
    }
  }

  return headers
}

export function parseSearchUrl(
  searchUrl: string,
  keyword: string,
  source: BookSource,
  page = 1,
  stage: RuleExecutionContext['stage'] = 'search',
): ParsedSearchRequest {
  const bookSourceUrl = source.bookSourceUrl || ''
  let rawUrl = selectPageCandidate(searchUrl.trim(), page)
  let postConfig: any = null

  const replacePlaceholders = (text: string) => {
    return text
      .replace(/\{\{key\}\}/g, encodeURIComponent(keyword))
      .replace(/\{\{keyword\}\}/g, encodeURIComponent(keyword))
      .replace(/\{\{page\}\}/g, String(page))
      .replace(/\{\{source\.bookSourceUrl\}\}/g, bookSourceUrl)
      .replace(/\{\{source\.baseUrl\}\}/g, bookSourceUrl)
      .replace(/\{\{baseUrl\}\}/g, bookSourceUrl)
      .replace(/\{\{sourceUrl\}\}/g, bookSourceUrl)
      .replace(/\{\{source\.bookSourceName\}\}/g, encodeURIComponent(source.bookSourceName || ''))
  }

  // 检查是否有逗号分隔的请求参数，例如: http://example.com/search,{"method":"POST", ...}
  const commaIdx = rawUrl.indexOf(',{')
  if (commaIdx !== -1) {
    const jsonStr = rawUrl.substring(commaIdx + 1)
    rawUrl = rawUrl.substring(0, commaIdx)
    try {
      postConfig = JSON.parse(replacePlaceholders(jsonStr))
    } catch (cause) {
      throw new RuleExecutionError(`请求 JSON 配置解析失败: ${jsonStr}`, {
        code: 'INVALID_RULE',
        rule: searchUrl,
        mode: 'legado',
        stage: 'search',
        cause,
      })
    }
  }

  // 替换 URL 中的占位符
  let finalUrl = replacePlaceholders(rawUrl)

  // 确保相对 URL（如 /bsearch?q=...）与基准源地址合成完整的 HTTP/HTTPS 绝对 URL
  finalUrl = resolveAbsoluteUrl(finalUrl, bookSourceUrl)

  let method: 'GET' | 'POST' | 'HEAD' = 'GET'
  let body: string | undefined = undefined
  const headers = getSourceHeaders(source, bookSourceUrl)
  let charset: string | undefined = undefined
  const requestOptions: Omit<ParsedSearchRequest, 'url' | 'method' | 'body' | 'headers' | 'charset'> = {}

  if (postConfig) {
    const configuredMethod = String(postConfig.method || '').toUpperCase()
    if (configuredMethod === 'POST' || configuredMethod === 'HEAD') method = configuredMethod
    if (postConfig.body != null) {
      body = replacePlaceholders(typeof postConfig.body === 'string' ? postConfig.body : JSON.stringify(postConfig.body))
    }
    if (postConfig.headers) {
      try {
        const configuredHeaders = typeof postConfig.headers === 'string'
          ? JSON.parse(replacePlaceholders(postConfig.headers)) : postConfig.headers
        if (configuredHeaders && typeof configuredHeaders === 'object') Object.assign(headers, configuredHeaders)
      } catch (cause) {
        throw new RuleExecutionError('请求 headers 配置解析失败', {
          code: 'INVALID_RULE', rule: searchUrl, mode: 'legado', stage, cause,
        })
      }
    }
    if (postConfig.charset) {
      charset = postConfig.charset
    }
    if (postConfig.serverID != null) {
      throw new RuleExecutionError('serverID 依赖 Android 应用服务', {
        code: 'UNSUPPORTED_ANDROID_API', rule: searchUrl, mode: 'legado', stage,
      })
    }
    if (postConfig.retry != null) requestOptions.retry = Math.max(0, Number(postConfig.retry) || 0)
    if (postConfig.timeout != null && Number.isFinite(Number(postConfig.timeout)) && Number(postConfig.timeout) > 0) {
      requestOptions.timeout = Math.trunc(Number(postConfig.timeout))
    }
    if (postConfig.followRedirects != null) requestOptions.followRedirects = parseBooleanOption(postConfig.followRedirects)
    if (postConfig.enabledCookieJar != null) requestOptions.useCookieJar = parseBooleanOption(postConfig.enabledCookieJar)
    if (postConfig.webView != null || postConfig.useWebView != null) {
      const configured = postConfig.webView ?? postConfig.useWebView
      requestOptions.useWebView = ![false, '', 'false', 0, '0'].includes(configured)
    }
    if (postConfig.webViewDelayTime != null) requestOptions.webViewDelayTime = Math.max(0, Number(postConfig.webViewDelayTime) || 0)
    if (postConfig.dnsIp || postConfig.resolveIp) requestOptions.dnsIp = String(postConfig.dnsIp || postConfig.resolveIp)
    if (postConfig.origin) requestOptions.origin = String(postConfig.origin)
    if (postConfig.type != null) requestOptions.responseType = 'hex'
    else if (postConfig.responseType === 'binary') requestOptions.responseType = 'binary'
    if (postConfig.js) requestOptions.urlJs = String(postConfig.js)
    if (postConfig.webJs) requestOptions.webJs = String(postConfig.webJs)
    if (postConfig.bodyJs) requestOptions.bodyJs = String(postConfig.bodyJs)
  }

  return {
    url: finalUrl,
    method,
    body,
    headers,
    charset,
    ...requestOptions,
  }
}

export async function parseSearchUrlAsync(
  searchUrl: string,
  keyword: string,
  source: BookSource,
  page = 1,
  context?: RuleExecutionContext,
): Promise<ParsedSearchRequest> {
  let raw = searchUrl.trim()
  const bookSourceUrl = source.bookSourceUrl || ''

  // 1. 处理内嵌 JS: @js: 或 <js>...</js>
  if (/@js:|<js>|<\/js>/i.test(raw)) {
    const jsContext: RuleExecutionContext = context || {
      compatibilityMode: source.webReaderCompatibilityMode || 'legado',
      source: source as unknown as Record<string, unknown>,
      baseUrl: bookSourceUrl,
      key: keyword,
      page,
      stage: 'search',
    }
    const jsPattern = /@js:([\s\S]+)$|<js>([\s\S]*?)<\/js>/i
    const match = raw.match(jsPattern)
    if (match) {
      const code = match[1] || match[2] || ''
      try {
        const jsResult = (await executeSourceJavaScript(source.bookSourceUrl, code, jsContext, raw)).result
        if (typeof jsResult === 'string' && jsResult.trim()) raw = jsResult.trim()
      } catch (cause) {
        throw new RuleExecutionError('搜索 URL 内嵌 JS 执行失败', {
          code: 'UNSUPPORTED_JAVASCRIPT', rule: raw, mode: 'legado', stage: 'search', cause,
        })
      }
    }
  }

  // 2. 处理 {{ ... }} 动态 JS 表达式（如果不是已知普通占位符）
  if (/\{\{(?!key|keyword|page|baseUrl|sourceUrl|source\.)([^{}]+)\}\}/.test(raw)) {
    const jsContext: RuleExecutionContext = context || {
      compatibilityMode: source.webReaderCompatibilityMode || 'legado',
      source: source as unknown as Record<string, unknown>,
      baseUrl: bookSourceUrl,
      key: keyword,
      page,
      stage: 'search',
    }
    const matches = Array.from(raw.matchAll(/\{\{(?!key|keyword|page|baseUrl|sourceUrl|source\.)([^{}]+)\}\}/g))
    for (const m of matches) {
      const expr = m[1]?.trim()
      if (expr) {
        try {
          const evalRes = (await executeSourceJavaScript(source.bookSourceUrl, expr, jsContext, '')).result
          raw = raw.replace(m[0], encodeURIComponent(String(evalRes ?? '')))
        } catch (cause) {
          throw new RuleExecutionError(`搜索 URL 动态 JS 表达式执行失败: ${expr}`, {
            code: 'UNSUPPORTED_JAVASCRIPT',
            rule: raw,
            mode: 'legado',
            stage: 'search',
            cause,
          })
        }
      }
    }
  }

  const request = parseSearchUrl(raw, keyword, source, page, context?.stage || 'search')
  if (request.urlJs?.trim()) {
    const jsContext: RuleExecutionContext = context || {
      compatibilityMode: source.webReaderCompatibilityMode || 'legado', source: source as unknown as Record<string, unknown>,
      baseUrl: bookSourceUrl, key: keyword, page, stage: 'search',
    }
    const value = (await executeSourceJavaScript(source.bookSourceUrl, request.urlJs, jsContext, request.url)).result
    if (value != null && String(value).trim()) request.url = resolveAbsoluteUrl(String(value), bookSourceUrl)
  }
  return request
}

export class SourceEngine {
  private async callMainJs(
    source: BookSource,
    functionName: string,
    context: RuleExecutionContext,
    argumentNames: string[],
    optional = false,
  ): Promise<unknown> {
    if (!source.mainJs?.trim()) return undefined
    const invocation = `${functionName}(${argumentNames.join(',')})`
    const fallback = optional ? 'undefined' : `(() => { throw new Error('JS源缺少函数 ${functionName}') })()`
    const code = `${source.jsLib || ''}\n${source.mainJs}\n;typeof ${functionName} === 'function' ? ${invocation} : ${fallback}`
    return (await executeSourceJavaScript(source.bookSourceUrl, code, context, null)).result
  }

  private normalizeMainJsResult(value: unknown): unknown {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    if (!trimmed || !/^[\[{]/.test(trimmed)) return value
    try { return JSON.parse(trimmed) } catch { return value }
  }
  /**
   * 统一请求方法：根据书源配置自动选择 reqwest 或 WebView 通道
   * - useWebView=true 的书源优先使用 WebView fetch（共享浏览器会话/指纹）
   * - 其余书源使用 reqwest 快速通道
   * - reqwest 通道遇到 Cloudflare challenge 时抛出 CloudflareChallengeError 提示用户
   */
  private async executeRequest(
    source: BookSource,
    url: string,
    method: 'GET' | 'POST' | 'HEAD',
    headers?: Record<string, string>,
    body?: string,
    charset?: string,
    timeout?: number,
    options: Partial<SourceRequest> = {},
  ): Promise<SourceResponse> {
    const transport = await getTransport()

    // WebView 通道：书源标记需要 WebView 且 transport 支持
    const useWebView = options.useWebView ?? source.useWebView ?? false
    const requestHeaders = { ...(headers || {}) }
    if (options.origin) requestHeaders.Origin = options.origin
    const request: SourceRequest = {
      sourceId: source.bookSourceUrl, url, method, headers: requestHeaders, body, charset,
      timeout: options.timeout ?? timeout ?? 25000,
      retry: options.retry,
      followRedirects: options.followRedirects,
      useCookieJar: options.useCookieJar ?? source.enabledCookieJar ?? false,
      useWebView,
      webViewDelayTime: options.webViewDelayTime,
      dnsIp: options.dnsIp,
      origin: options.origin,
      responseType: options.responseType,
      webJs: options.webJs,
      bodyJs: options.bodyJs,
    }
    if (useWebView && transport.webviewFetch) {
      await waitForConcurrentRate(source)
      const response = await transport.webviewFetch({
        ...request,
      })
      return this.applyRequestScripts(source, response, request)
    }

    // 默认 reqwest 快速通道
    let response: SourceResponse | undefined
    let lastError: unknown
    const attempts = Math.max(1, (options.retry ?? 2) + 1)
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await waitForConcurrentRate(source)
        response = await transport.request(request)
        if (response.status < 500 || attempt === attempts) break
      } catch (error) {
        lastError = error
        if (attempt === attempts) throw error
      }
    }
    if (!response) throw lastError instanceof Error ? lastError : new Error('书源请求失败')

    // 自动检测安全验证 challenge，抛出带诊断信息的错误
    if (!useWebView) {
      const html = decodeResponse(response.body, response.charset || 'utf-8')
      const challenge = detectSecurityChallenge(html, response)
      if (challenge.isChallenge) {
        if (challenge.type === 'cloudflare') {
          throw new CloudflareChallengeError(
            '检测到 Cloudflare 验证，请在书源设置中启用 WebView 通道或先完成网页验证。',
            response,
            { isChallenge: true, cfRay: challenge.cfRay, cfMitigated: challenge.cfMitigated },
          )
        }
        throw new SecurityChallengeError(
          `目标网站返回了安全验证页面（${challenge.title || '浏览器安全质询'}）。请在书源设置中启用 WebView 通道或先完成网页验证。`,
          challenge,
          response,
        )
      }
    }

    return this.applyRequestScripts(source, response, request)
  }

  private async applyRequestScripts(
    source: BookSource,
    response: SourceResponse,
    request: SourceRequest,
  ): Promise<SourceResponse> {
    if (request.responseType === 'binary') return response
    if (request.responseType === 'hex') {
      const hex = Array.from(response.body, byte => byte.toString(16).padStart(2, '0')).join('')
      response = { ...response, body: new TextEncoder().encode(hex), charset: 'utf-8' }
    }
    if (!request.bodyJs?.trim() && !request.webJs?.trim()) return response
    const context = this.createRuleContext(source, 'unknown', {
      baseUrl: response.finalUrl || request.url,
      redirectUrl: response.finalUrl,
    })
    let value: unknown = decodeResponse(response.body, response.charset || request.charset || 'utf-8')
    if (request.webJs?.trim()) {
      value = (await executeSourceWebJavaScript(source.bookSourceUrl, request.webJs, context, value)).result
    }
    if (request.bodyJs?.trim()) {
      value = (await executeSourceJavaScript(source.bookSourceUrl, request.bodyJs, context, value)).result
    }
    await this.commitRuleContext(source, context)
    const text = typeof value === 'string' ? value : JSON.stringify(value ?? '')
    return { ...response, body: new TextEncoder().encode(text), charset: 'utf-8' }
  }

  private createRuleContext(
    source: BookSource,
    stage: RuleExecutionContext['stage'],
    values: Partial<RuleExecutionContext> = {},
  ): RuleExecutionContext {
    const sourceVariables = source.variableMap || {}
    const bookVariables = values.book && typeof values.book.variableMap === 'object'
      ? values.book.variableMap as Record<string, string> : {}
    const chapterVariables = values.chapter && typeof values.chapter.variableMap === 'object'
      ? values.chapter.variableMap as Record<string, string> : {}
    const variableTarget = values.chapter || values.book || source as unknown as Record<string, unknown>
    const initialVariables = {
      ...sourceVariables,
      ...bookVariables,
      ...chapterVariables,
    }
    return {
      compatibilityMode: source.webReaderCompatibilityMode || 'legado',
      stage,
      source: source as unknown as Record<string, unknown>,
      variables: new Map<string, string>(Object.entries(initialVariables)),
      variableTarget,
      variableSnapshot: JSON.stringify(initialVariables),
      variableInitial: initialVariables,
      ...values,
    }
  }

  private async commitRuleContext(source: BookSource, context: RuleExecutionContext): Promise<void> {
    if (!context.variables || !context.variableTarget) return
    const variableMap = Object.fromEntries(context.variables)
    if (JSON.stringify(variableMap) === context.variableSnapshot) return
    const targetMap = context.variableTarget.variableMap && typeof context.variableTarget.variableMap === 'object'
      ? { ...(context.variableTarget.variableMap as Record<string, string>) } : {}
    for (const [key, value] of Object.entries(variableMap)) {
      if (context.variableInitial?.[key] !== value) targetMap[key] = value
    }
    context.variableTarget.variableMap = targetMap
    if (context.variableTarget === source as unknown as Record<string, unknown>) {
      source.variableMap = targetMap
      await saveBookSource(source as unknown as Record<string, unknown>)
    }
  }

  private assertRunnableSource(source: BookSource) {
    if (typeof source.bookSourceType !== 'number' || ![0, 2].includes(source.bookSourceType)) {
      const error = new Error(`当前 Tauri 引擎暂不支持 bookSourceType=${source.bookSourceType}`)
      error.name = 'UNSUPPORTED_SOURCE_TYPE'
      throw error
    }
  }

  async checkLogin(source: BookSource): Promise<{ checked: boolean; loggedIn: boolean; detail?: string }> {
    if (!source.loginCheckJs?.trim()) return { checked: false, loggedIn: false }
    const loginUrl = resolveAbsoluteUrl(source.loginUrl || source.bookSourceUrl, source.bookSourceUrl)
    const context = this.createRuleContext(source, 'login', { baseUrl: loginUrl })
    const value = (await executeSourceJavaScript(
      source.bookSourceUrl, `${source.jsLib || ''}\n${source.loginCheckJs}`, context, loginUrl,
    )).result
    await this.commitRuleContext(source, context)
    const loggedIn = typeof value === 'boolean'
      ? value
      : !/^(?:false|0|null|undefined|)$/i.test(String(value ?? '').trim())
    return { checked: true, loggedIn, detail: typeof value === 'string' ? value : undefined }
  }

  async fetchSourceAsset(source: BookSource, url: string, refererUrl: string): Promise<{ body: Uint8Array; mime: string }> {
    const headers = getSourceHeaders(source, refererUrl)
    headers.Accept = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
    const response = await this.executeRequest(source, url, 'GET', headers, undefined, undefined, 25000)
    if (response.status >= 400) throw createHttpError(response, `请求图片失败 (HTTP ${response.status})`)
    const mime = Object.entries(response.headers)
      .find(([name]) => name.toLowerCase() === 'content-type')?.[1]?.split(';')[0] || 'application/octet-stream'
    let body = response.body
    if (source.ruleContent?.imageDecode?.trim()) {
      const context = this.createRuleContext(source, 'content', { baseUrl: refererUrl })
      try {
        const decoded = (await executeSourceJavaScript(
          source.bookSourceUrl, source.ruleContent.imageDecode, context, Array.from(body),
        )).result
        if (Array.isArray(decoded)) {
          body = new Uint8Array(decoded.map(value => Number(value) & 0xff))
        } else if (typeof decoded === 'string') {
          const binary = atob(decoded.replace(/^data:[^,]+,/, ''))
          body = Uint8Array.from(binary, char => char.charCodeAt(0))
        } else {
          throw new Error('imageDecode 必须返回字节数组或 Base64 字符串')
        }
      } catch (cause) {
        throw new Error(`图片解密规则失败: ${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }
    return { body, mime }
  }

  async search(
    source: BookSource,
    keyword: string,
    onProgress?: (info: { status: number; finalUrl: string; bodyLength: number; channel?: string }) => void,
    page = 1,
  ): Promise<SearchResult[]> {
    this.assertRunnableSource(source)
    const configuredKeyword = source.ruleSearch?.checkKeyWord?.trim()
    const effectiveKeyword = configuredKeyword
      && !configuredKeyword.includes('http') && !configuredKeyword.includes('::')
      && !configuredKeyword.includes('++') && !configuredKeyword.includes('--')
      ? configuredKeyword : keyword
    if (source.mainJs?.trim()) {
      const context = this.createRuleContext(source, 'search', { key: effectiveKeyword, page, baseUrl: source.bookSourceUrl })
      const value = this.normalizeMainJsResult(await this.callMainJs(source, 'search', context, ['key', 'page']))
      if (!Array.isArray(value)) throw new Error('mainJs search 返回值不是数组')
      const results = value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map(item => ({
          name: String(item.name || item.bookName || ''), author: String(item.author || ''),
          bookUrl: resolveAbsoluteUrl(String(item.bookUrl || item.url || ''), source.bookSourceUrl),
          coverUrl: resolveAbsoluteUrl(String(item.coverUrl || item.cover || ''), source.bookSourceUrl),
          intro: String(item.intro || ''), kind: String(item.kind || ''),
          lastChapter: String(item.lastChapter || ''), sourceName: source.bookSourceName,
          sourceUrl: source.bookSourceUrl,
          updateTime: item.updateTime == null ? undefined : String(item.updateTime),
          wordCount: item.wordCount == null ? undefined : String(item.wordCount),
          variableMap: item.variableMap && typeof item.variableMap === 'object'
            ? item.variableMap as Record<string, string> : undefined,
        })).filter(item => item.name && item.bookUrl)
      await this.commitRuleContext(source, context)
      return results
    }
    if (!source.searchUrl || !source.ruleSearch) {
      return []
    }

    const context = this.createRuleContext(source, 'search', { key: effectiveKeyword, page, baseUrl: source.bookSourceUrl })
    const searchReq = await parseSearchUrlAsync(source.searchUrl, effectiveKeyword, source, page, context)

    const response = await this.executeRequest(
      source,
      searchReq.url,
      searchReq.method,
      searchReq.headers,
      searchReq.body,
      searchReq.charset,
      25000,
      searchReq,
    )

    if (onProgress) {
      onProgress({
        status: response.status,
        finalUrl: response.finalUrl || searchReq.url,
        bodyLength: response.body.length,
        channel: response.channel,
      })
    }

    if (response.status >= 400) {
      throw createHttpError(
        response,
        `目标网站返回 HTTP ${response.status} 错误 (URL: ${response.finalUrl || searchReq.url})`
      )
    }

    const html = decodeResponse(response.body, response.charset || searchReq.charset || 'utf-8')
    const effectiveBaseUrl = response.finalUrl || searchReq.url || source.bookSourceUrl
    const results = await parseSearchResults(html, source.ruleSearch, effectiveBaseUrl, source, context)

    // 兜底：如果列表解析为空，但页面直接是单本书籍详情页（搜索词与页面中的书籍一致）
    if (results.length === 0 && (source.ruleBookInfo || html.includes('<h1'))) {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const bookName =
        parseString(doc, source.ruleBookInfo?.name || '') ||
        parseString(doc, 'h1') ||
        parseString(doc, '.title')

      if (bookName && (bookName.includes(effectiveKeyword) || effectiveKeyword.includes(bookName))) {
        const author = parseString(doc, source.ruleBookInfo?.author || '') || parseString(doc, '.author')
        const rawCover = parseString(doc, source.ruleBookInfo?.coverUrl || '') || parseString(doc, 'img@src')
        const coverUrl = resolveAbsoluteUrl(rawCover, effectiveBaseUrl)
        const intro = parseString(doc, source.ruleBookInfo?.intro || '') || parseString(doc, '.intro')

        results.push({
          name: bookName,
          author,
          bookUrl: effectiveBaseUrl,
          coverUrl,
          intro,
          sourceName: source.bookSourceName,
          sourceUrl: source.bookSourceUrl,
        })
      }
    }

    await this.commitRuleContext(source, context)
    return results
  }

  async explore(
    source: BookSource,
    exploreUrl?: string,
    page = 1,
    onProgress?: (info: { status: number; finalUrl: string; bodyLength: number; channel?: string }) => void,
  ): Promise<SearchResult[]> {
    this.assertRunnableSource(source)
    const targetExploreUrl = exploreUrl || source.exploreUrl
    if (!targetExploreUrl) return []

    if (source.mainJs?.trim()) {
      const context = this.createRuleContext(source, 'explore', { page, baseUrl: source.bookSourceUrl })
      const value = this.normalizeMainJsResult(await this.callMainJs(source, 'explore', context, ['baseUrl', 'page'], true))
      if (value === undefined) return []
      if (!Array.isArray(value)) throw new Error('mainJs explore 返回值不是数组')
      const results = value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map(item => ({
          name: String(item.name || item.bookName || ''), author: String(item.author || ''),
          bookUrl: resolveAbsoluteUrl(String(item.bookUrl || item.url || ''), source.bookSourceUrl),
          coverUrl: resolveAbsoluteUrl(String(item.coverUrl || item.cover || ''), source.bookSourceUrl),
          intro: String(item.intro || ''), kind: String(item.kind || ''),
          lastChapter: String(item.lastChapter || ''), sourceName: source.bookSourceName,
          sourceUrl: source.bookSourceUrl,
        })).filter(item => item.name && item.bookUrl)
      await this.commitRuleContext(source, context)
      return results
    }

    const ruleExplore = source.ruleExplore || source.ruleSearch
    if (!ruleExplore) return []

    const searchRule: SearchRule = {
      bookList: ruleExplore.bookList,
      name: ruleExplore.name,
      author: ruleExplore.author,
      intro: ruleExplore.intro,
      kind: ruleExplore.kind,
      lastChapter: ruleExplore.lastChapter,
      updateTime: ruleExplore.updateTime,
      bookUrl: ruleExplore.bookUrl,
      coverUrl: ruleExplore.coverUrl,
      wordCount: ruleExplore.wordCount,
    }

    const context = this.createRuleContext(source, 'explore', { page, baseUrl: source.bookSourceUrl })
    const request = await parseSearchUrlAsync(targetExploreUrl, '', source, page, context)
    const response = await this.executeRequest(
      source, request.url, request.method, request.headers, request.body, request.charset, 25000, request,
    )
    if (onProgress) {
      onProgress({
        status: response.status,
        finalUrl: response.finalUrl || request.url,
        bodyLength: response.body.length,
        channel: response.channel,
      })
    }
    if (response.status >= 400) {
      throw createHttpError(response, `发现页请求失败 (HTTP ${response.status})`)
    }
    const html = decodeResponse(response.body, response.charset || request.charset || 'utf-8')
    const effectiveBaseUrl = response.finalUrl || request.url || source.bookSourceUrl
    const results = await parseSearchResults(html, searchRule, effectiveBaseUrl, source, context)
    await this.commitRuleContext(source, context)
    return results
  }

  async getBookInfo(source: BookSource, bookOrUrl: string | (Partial<BookInfo> & { bookUrl: string })): Promise<BookInfo> {
    this.assertRunnableSource(source)
    const bookUrl = typeof bookOrUrl === 'string' ? bookOrUrl : bookOrUrl.bookUrl
    const bookEntity = typeof bookOrUrl === 'string' ? { bookUrl, url: bookUrl } : bookOrUrl as Record<string, unknown>
    if (source.mainJs?.trim()) {
      const book = bookEntity
      const context = this.createRuleContext(source, 'bookInfo', { book, baseUrl: bookUrl })
      const value = this.normalizeMainJsResult(await this.callMainJs(source, 'getBookInfo', context, ['book'], true))
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        await this.commitRuleContext(source, context)
        return {
          name: String(bookEntity.name || ''), author: String(bookEntity.author || ''),
          coverUrl: String(bookEntity.coverUrl || ''), intro: String(bookEntity.intro || ''),
          tocUrl: String(bookEntity.tocUrl || bookUrl), kind: bookEntity.kind == null ? undefined : String(bookEntity.kind),
          lastChapter: bookEntity.lastChapter == null ? undefined : String(bookEntity.lastChapter),
          updateTime: bookEntity.updateTime == null ? undefined : String(bookEntity.updateTime),
          wordCount: bookEntity.wordCount == null ? undefined : String(bookEntity.wordCount),
          variableMap: bookEntity.variableMap as Record<string, string> | undefined,
        }
      }
      const item = value as Record<string, unknown>
      const info: BookInfo = {
        name: String(item.name || ''), author: String(item.author || ''), intro: String(item.intro || ''),
        coverUrl: resolveAbsoluteUrl(String(item.coverUrl || ''), bookUrl),
        tocUrl: resolveAbsoluteUrl(String(item.tocUrl || bookUrl), bookUrl),
        kind: item.kind == null ? undefined : String(item.kind),
        lastChapter: item.lastChapter == null ? undefined : String(item.lastChapter),
        updateTime: item.updateTime == null ? undefined : String(item.updateTime),
        wordCount: item.wordCount == null ? undefined : String(item.wordCount),
        canReName: item.canReName == null ? undefined : Boolean(item.canReName),
        downloadUrls: Array.isArray(item.downloadUrls) ? item.downloadUrls.map(String) : undefined,
        variableMap: item.variableMap && typeof item.variableMap === 'object'
          ? item.variableMap as Record<string, string> : undefined,
      }
      await this.commitRuleContext(source, context)
      return info
    }
    if (!source.ruleBookInfo) {
      throw new Error('书源未配置 ruleBookInfo')
    }

    const context = this.createRuleContext(source, 'bookInfo', { baseUrl: bookUrl, book: bookEntity })
    const request = await parseSearchUrlAsync(bookUrl, '', source, 1, context)
    const targetUrl = request.url
    const response = await this.executeRequest(
      source,
      targetUrl,
      request.method,
      request.headers,
      request.body,
      request.charset,
      undefined,
      request,
    )

    if (response.status >= 400) {
      throw createHttpError(response, `请求详情页失败 (HTTP ${response.status})`)
    }

    const html = decodeResponse(response.body, response.charset || 'utf-8')
    const effectiveBaseUrl = response.finalUrl || targetUrl
    const info = await parseBookInfo(html, source.ruleBookInfo, effectiveBaseUrl, { ...context, baseUrl: effectiveBaseUrl })
    await this.commitRuleContext(source, context)
    return info
  }

  async getToc(
    source: BookSource,
    tocOrBook: string | ({ tocUrl?: string; bookUrl: string; variableMap?: Record<string, string> }),
    onProgress?: (info: { page: number; url: string; count: number }) => void,
  ): Promise<TocItem[]> {
    this.assertRunnableSource(source)
    const tocUrl = typeof tocOrBook === 'string' ? tocOrBook : tocOrBook.tocUrl || tocOrBook.bookUrl
    const bookEntity = typeof tocOrBook === 'string' ? { bookUrl: tocUrl, tocUrl } : tocOrBook as Record<string, unknown>
    if (source.mainJs?.trim()) {
      const book = bookEntity
      const context = this.createRuleContext(source, 'toc', { book, baseUrl: tocUrl })
      const value = this.normalizeMainJsResult(await this.callMainJs(source, 'getChapters', context, ['book']))
      if (!Array.isArray(value)) throw new Error('mainJs getChapters 返回值不是数组')
      const chapters = value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map(item => ({
          name: String(item.name || item.title || ''),
          url: resolveAbsoluteUrl(String(item.url || item.chapterUrl || ''), tocUrl),
          isVolume: Boolean(item.isVolume), isVip: Boolean(item.isVip), isPay: Boolean(item.isPay),
          updateTime: item.updateTime === undefined ? undefined : String(item.updateTime),
          variableMap: item.variableMap && typeof item.variableMap === 'object'
            ? item.variableMap as Record<string, string> : undefined,
        })).filter(item => item.name && item.url)
      await this.commitRuleContext(source, context)
      return chapters
    }
    if (!source.ruleToc) {
      throw new Error('书源未配置 ruleToc')
    }

    let url = tocUrl
    const visited = new Set<string>()
    const chapters: TocItem[] = []
    const book = bookEntity
    const context = this.createRuleContext(source, 'toc', { baseUrl: tocUrl, book })

    let initialBody: string | null = null
    if (source.ruleToc.preUpdateJs?.trim()) {
      const updated = (await executeSourceJavaScript(
        source.bookSourceUrl, source.ruleToc.preUpdateJs, context, url,
      )).result
      if (updated) {
        if (typeof updated === 'object') {
          initialBody = JSON.stringify(updated)
        } else if (typeof updated === 'string') {
          const trimmed = updated.trim()
          if (trimmed.startsWith('{') || trimmed.startsWith('[') || /^\s*<(?:!DOCTYPE|html|head|body|ul|ol|div|section|table)/i.test(trimmed)) {
            initialBody = trimmed
          } else if (trimmed) {
            url = trimmed
          }
        }
      }
    }

    for (let page = 1; (url || initialBody) && page <= 100; page += 1) {
      let html = ''
      let effectiveBaseUrl = url || tocUrl

      if (page === 1 && initialBody) {
        html = initialBody
        effectiveBaseUrl = tocUrl
        Object.assign(context, { page, baseUrl: effectiveBaseUrl })
      } else {
        if (!url) break
        const request = await parseSearchUrlAsync(url, '', source, page, context)
        const requestUrl = new URL(request.url)
        requestUrl.hash = ''
        const requestKey = `${request.method}:${requestUrl.href}:${request.body || ''}`
        if (visited.has(requestKey)) break
        visited.add(requestKey)
        const response = await this.executeRequest(source, request.url, request.method, request.headers, request.body, request.charset, undefined, request)
        if (response.status >= 400) throw createHttpError(response, `请求目录页失败 (HTTP ${response.status})`)
        html = decodeResponse(response.body, response.charset || 'utf-8')
        effectiveBaseUrl = response.finalUrl || requestUrl.href
        Object.assign(context, { page, baseUrl: effectiveBaseUrl, redirectUrl: response.finalUrl })
      }

      const newChapters = await parseToc(html, source.ruleToc, effectiveBaseUrl, context)
      chapters.push(...newChapters)
      onProgress?.({ page, url: effectiveBaseUrl, count: newChapters.length })
      if (!source.ruleToc.nextTocUrl) break
      const doc = html.trim().startsWith('{') || html.trim().startsWith('[')
        ? JSON.parse(html) : new DOMParser().parseFromString(html, 'text/html')
      const next = await parseStringAsync(doc, source.ruleToc.nextTocUrl, {
        ...context, field: 'ruleToc.nextTocUrl',
      })
      url = next ? resolveAbsoluteUrl(next, effectiveBaseUrl) : ''
    }
    await this.commitRuleContext(source, context)
    return chapters.filter((chapter, index) =>
      chapters.findIndex(other => other.url === chapter.url && other.name === chapter.name) === index)
  }

  async getContent(
    source: BookSource,
    contentOrChapter: string | ({ url?: string; chapterUrl?: string; variableMap?: Record<string, string> }),
    onProgress?: (info: { page: number; url: string; currentLength: number }) => void,
    book?: Record<string, unknown>,
  ): Promise<OnlineChapterPayload> {
    this.assertRunnableSource(source)
    const contentUrl = typeof contentOrChapter === 'string'
      ? contentOrChapter : contentOrChapter.chapterUrl || contentOrChapter.url || ''
    const chapterEntity = typeof contentOrChapter === 'string'
      ? { url: contentUrl, chapterUrl: contentUrl } : contentOrChapter as Record<string, unknown>
    if (source.mainJs?.trim()) {
      const chapter = chapterEntity
      const bookEntity = book || { bookUrl: contentUrl }
      const context = this.createRuleContext(source, 'content', { chapter, book: bookEntity, baseUrl: contentUrl, nextChapterUrl: '' })
      const value = this.normalizeMainJsResult(await this.callMainJs(source, 'getContent', context, ['chapter', 'book', 'nextChapterUrl']))
      await this.commitRuleContext(source, context)
      if (source.bookSourceType === 2) {
        const urls = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\r\n,]+/) : []
        return {
          type: 'images', sourceUrl: contentUrl,
          images: urls.map(String).filter(Boolean).map((url, index) => ({ url: resolveAbsoluteUrl(url, contentUrl), index })),
        }
      }
      return { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value ?? '') }
    }
    if (!source.ruleContent) {
      throw new Error('书源未配置 ruleContent')
    }

    const pendingUrls: string[] = [contentUrl]
    const contentPages: string[] = []
    const imagePages: OnlineChapterPayload[] = []
    const visitedUrls = new Set<string>()
    const context = this.createRuleContext(source, 'content', { baseUrl: contentUrl, chapter: chapterEntity, book })
    let page = 0
    let payloadTitle: string | undefined
    const embeddedImages: NonNullable<Extract<OnlineChapterPayload, { type: 'text' }>['embeddedImages']> = []

    while (pendingUrls.length > 0 && page < 100) {
      const currentUrl = pendingUrls.shift()!
      const request = await parseSearchUrlAsync(currentUrl, '', source, page + 1, context)
      const requestUrl = new URL(request.url)
      requestUrl.hash = ''
      const requestKey = `${request.method}:${requestUrl.href}:${request.body || ''}`
      if (visitedUrls.has(requestKey)) continue
      visitedUrls.add(requestKey)
      page += 1

      const response = await this.executeRequest(source, request.url, request.method, request.headers, request.body, request.charset, undefined, request)

      if (response.status >= 400) {
        throw createHttpError(response, `请求正文页失败 (HTTP ${response.status})`)
      }

      let html = decodeResponse(response.body, response.charset || 'utf-8')
      const effectiveBaseUrl = response.finalUrl || requestUrl.href
      Object.assign(context, { page, baseUrl: effectiveBaseUrl, redirectUrl: response.finalUrl })

      // 在非 WebView 模式下，检测响应是否命中了前端防爬安全质询拦截（如 5 秒盾、浏览器安全检查）
      if (!source.useWebView) {
        const challenge = detectSecurityChallenge(html, response)
        if (challenge.isChallenge) {
          throw new SecurityChallengeError(
            `目标网站返回了安全验证页面（${challenge.title || '浏览器安全质询'}），普通 HTTP 请求未能获取到有效正文。请开启 WebView 通道或先完成网页验证。`,
            challenge,
            response,
          )
        }
      }

      if (source.ruleContent.webJs?.trim()) {
        const transformed = (await executeSourceWebJavaScript(
          source.bookSourceUrl, source.ruleContent.webJs, context, html,
        )).result
        if (typeof transformed === 'string') html = transformed
      }
      if (source.bookSourceType === 2) {
        const result = await parseImageContent(html, source.ruleContent, effectiveBaseUrl, context)
        imagePages.push(result.payload)
        onProgress?.({ page, url: currentUrl, currentLength: result.payload.images.length })
        if (result.nextUrls && result.nextUrls.length > 1) {
          for (const u of result.nextUrls) {
            if (!visitedUrls.has(u) && !pendingUrls.includes(u)) pendingUrls.push(u)
          }
        } else if (result.nextUrl && !visitedUrls.has(result.nextUrl) && !pendingUrls.includes(result.nextUrl)) {
          pendingUrls.push(result.nextUrl)
        }
        continue
      }
      const result: ContentResult = await parseContent(html, source.ruleContent, effectiveBaseUrl, context)
      payloadTitle ||= result.title
      for (const image of result.embeddedImages || []) {
        if (!embeddedImages.some(existing => existing.url === image.url)) {
          embeddedImages.push({ ...image, index: embeddedImages.length })
        }
      }

      if (result.content) {
        contentPages.push(result.content)
      }
      onProgress?.({ page, url: currentUrl, currentLength: contentPages.length })

      if (result.nextUrls && result.nextUrls.length > 1) {
        for (const u of result.nextUrls) {
          if (!visitedUrls.has(u) && !pendingUrls.includes(u)) pendingUrls.push(u)
        }
      } else if (result.nextUrl && !visitedUrls.has(result.nextUrl) && !pendingUrls.includes(result.nextUrl)) {
        pendingUrls.push(result.nextUrl)
      }
    }

    const fullContent = contentPages
      .join('\n')
      .split(/\r?\n+/)
      .map(line => line.trim())
      .filter(Boolean)
      .join('\n')

    if (source.bookSourceType === 2) {
      const images = imagePages.flatMap(payload => payload.type === 'images' ? payload.images : [])
        .map((image, index) => ({ ...image, index }))
      await this.commitRuleContext(source, context)
      return {
        type: 'images', images,
        title: imagePages.find(payload => payload.title)?.title,
        style: source.ruleContent.imageStyle,
        sourceUrl: contentUrl,
        decodeRule: source.ruleContent.imageDecode,
      }
    }
    const payload: OnlineChapterPayload = {
      type: 'text',
      text: applyTextReplaceRule(fullContent, source.ruleContent.replaceRegex).trim(),
      title: payloadTitle,
      embeddedImages: embeddedImages.length > 0 ? embeddedImages : undefined,
    }
    await this.commitRuleContext(source, context)
    return payload
  }
}
