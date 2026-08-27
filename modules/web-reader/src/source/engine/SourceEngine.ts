import type { BookSource, OnlineChapterPayload, SearchResult, SearchRule } from '@/source/types/BookSource'
import { getTransport } from '@/source/transport'
import type { SourceResponse, CfDiagnostics } from '@/source/transport/SourceTransport'
import { parseSearchResults } from './SearchParser'
import { parseBookInfo, type BookInfo } from './BookInfoParser'
import { parseToc, type TocItem } from './TocParser'
import { parseContent, parseImageContent, type ContentResult } from './ContentParser'
import { applyTextReplaceRule, parseString, parseStringAsync, resolveAbsoluteUrl } from './RuleParser'
import { RuleExecutionError, type RuleExecutionContext } from './RuleTypes'
import { executeSourceJavaScript, executeSourceWebJavaScript } from '@/platform/sourceScripts'

export function decodeResponse(body: Uint8Array, charset: string = 'utf-8'): string {
  try {
    const decoder = new TextDecoder(charset)
    return decoder.decode(body)
  } catch {
    const decoder = new TextDecoder('utf-8')
    return decoder.decode(body)
  }
}

/** 从响应中提取 Cloudflare 诊断信息 */
export function extractCfDiagnostics(response: SourceResponse): CfDiagnostics {
  const getHeader = (name: string) =>
    Object.entries(response.headers).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1]

  const server = getHeader('server')
  const cfRay = getHeader('cf-ray')
  const cfMitigated = getHeader('cf-mitigated')

  const isCloudflare = server?.toLowerCase().includes('cloudflare') ?? false

  let isChallenge = false
  if (response.status === 403 && isCloudflare) {
    const html = decodeResponse(response.body, response.charset || 'utf-8').toLowerCase()
    isChallenge = [
      'just a moment',
      'attention required',
      'sorry, you have been blocked',
      'cf-mitigated',
      '/cdn-cgi/challenge-platform/',
    ].some(marker => html.includes(marker))
  }

  return { isChallenge, cfRay, cfMitigated }
}

/** Cloudflare 验证挑战错误，携带诊断信息和原始响应 */
export class CloudflareChallengeError extends Error {
  readonly diagnostics: CfDiagnostics
  readonly response: SourceResponse

  constructor(message: string, response: SourceResponse, diagnostics: CfDiagnostics) {
    super(message)
    this.name = 'CloudflareChallengeError'
    this.diagnostics = diagnostics
    this.response = response
  }
}

function createHttpError(response: SourceResponse, fallbackMessage: string): Error {
  const cfInfo = extractCfDiagnostics(response)
  if (cfInfo.isChallenge) {
    return new CloudflareChallengeError(
      '目标网站触发 Cloudflare 浏览器访问验证（HTTP 403）。请启用 WebView 通道或先完成网页验证。',
      response,
      cfInfo,
    )
  }

  return new Error(fallbackMessage)
}

export interface ParsedSearchRequest {
  url: string
  method: 'GET' | 'POST' | 'HEAD'
  body?: string
  headers?: Record<string, string>
  charset?: string
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
  page = 1
): ParsedSearchRequest {
  const bookSourceUrl = source.bookSourceUrl || ''
  let rawUrl = searchUrl.trim()
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

  if (postConfig) {
    const configuredMethod = String(postConfig.method || '').toUpperCase()
    if (configuredMethod === 'POST' || configuredMethod === 'HEAD') method = configuredMethod
    if (postConfig.body) {
      body = replacePlaceholders(String(postConfig.body))
    }
    if (postConfig.headers) {
      Object.assign(headers, postConfig.headers)
    }
    if (postConfig.charset) {
      charset = postConfig.charset
    }
  }

  return {
    url: finalUrl,
    method,
    body,
    headers,
    charset,
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
        if (typeof jsResult === 'string' && jsResult.trim()) {
          raw = jsResult.trim()
        }
      } catch (err) {
        console.warn('URL 内嵌 JS 执行失败', err)
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

  return parseSearchUrl(raw, keyword, source, page)
}

export class SourceEngine {
  private async callMainJs(
    source: BookSource,
    functionName: string,
    context: RuleExecutionContext,
    argumentNames: string[],
  ): Promise<unknown> {
    if (!source.mainJs?.trim()) return undefined
    const invocation = `${functionName}(${argumentNames.join(',')})`
    const code = `${source.jsLib || ''}\n${source.mainJs}\n;typeof ${functionName} === 'function' ? ${invocation} : (() => { throw new Error('JS源缺少函数 ${functionName}') })()`
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
  ): Promise<SourceResponse> {
    const transport = await getTransport()

    // WebView 通道：书源标记需要 WebView 且 transport 支持
    if (source.useWebView && transport.webviewFetch) {
      return transport.webviewFetch({
        sourceId: source.bookSourceUrl,
        url,
        method,
        headers,
        body,
        charset,
        timeout: timeout ?? 25000,
      })
    }

    // 默认 reqwest 快速通道
    let response: SourceResponse | undefined
    let lastError: unknown
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        response = await transport.request({
          sourceId: source.bookSourceUrl, url, method, headers, body, charset,
          timeout: timeout ?? 25000,
        })
        if (response.status < 500 || attempt === 3) break
      } catch (error) {
        lastError = error
        if (attempt === 3) throw error
      }
    }
    if (!response) throw lastError instanceof Error ? lastError : new Error('书源请求失败')

    // 自动检测 Cloudflare challenge，抛出带诊断信息的错误
    if (response.status === 403) {
      const cfInfo = extractCfDiagnostics(response)
      if (cfInfo.isChallenge) {
        throw new CloudflareChallengeError(
          '检测到 Cloudflare 验证，请在书源设置中启用 WebView 通道或先完成网页验证。',
          response,
          cfInfo,
        )
      }
    }

    return response
  }

  private createRuleContext(
    source: BookSource,
    stage: RuleExecutionContext['stage'],
    values: Partial<RuleExecutionContext> = {},
  ): RuleExecutionContext {
    return {
      compatibilityMode: source.webReaderCompatibilityMode || 'legado',
      stage,
      source: source as unknown as Record<string, unknown>,
      variables: new Map<string, string>(),
      ...values,
    }
  }

  private assertRunnableSource(source: BookSource) {
    if (![0, 2].includes(source.bookSourceType)) {
      const error = new Error(`当前 Tauri 引擎暂不支持 bookSourceType=${source.bookSourceType}`)
      error.name = 'UNSUPPORTED_SOURCE_TYPE'
      throw error
    }
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
    onProgress?: (info: { status: number; finalUrl: string; bodyLength: number; channel?: string }) => void
  ): Promise<SearchResult[]> {
    this.assertRunnableSource(source)
    if (source.mainJs?.trim()) {
      const context = this.createRuleContext(source, 'search', { key: keyword, page: 1, baseUrl: source.bookSourceUrl })
      const value = this.normalizeMainJsResult(await this.callMainJs(source, 'search', context, ['key', 'page']))
      if (!Array.isArray(value)) throw new Error('mainJs search 返回值不是数组')
      return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map(item => ({
          name: String(item.name || item.bookName || ''), author: String(item.author || ''),
          bookUrl: resolveAbsoluteUrl(String(item.bookUrl || item.url || ''), source.bookSourceUrl),
          coverUrl: resolveAbsoluteUrl(String(item.coverUrl || item.cover || ''), source.bookSourceUrl),
          intro: String(item.intro || ''), kind: String(item.kind || ''),
          lastChapter: String(item.lastChapter || ''), sourceName: source.bookSourceName,
          sourceUrl: source.bookSourceUrl,
        })).filter(item => item.name && item.bookUrl)
    }
    if (!source.searchUrl || !source.ruleSearch) {
      return []
    }

    const context = this.createRuleContext(source, 'search', { key: keyword, page: 1, baseUrl: source.bookSourceUrl })
    const searchReq = await parseSearchUrlAsync(source.searchUrl, keyword, source, 1, context)

    const response = await this.executeRequest(
      source,
      searchReq.url,
      searchReq.method,
      searchReq.headers,
      searchReq.body,
      searchReq.charset,
      25000,
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
    const results = await parseSearchResults(html, source.ruleSearch, effectiveBaseUrl, source)

    // 兜底：如果列表解析为空，但页面直接是单本书籍详情页（搜索词与页面中的书籍一致）
    if (results.length === 0 && (source.ruleBookInfo || html.includes('<h1'))) {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const bookName =
        parseString(doc, source.ruleBookInfo?.name || '') ||
        parseString(doc, 'h1') ||
        parseString(doc, '.title')

      if (bookName && (bookName.includes(keyword) || keyword.includes(bookName))) {
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
      source, request.url, request.method, request.headers, request.body, request.charset, 25000,
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
    return await parseSearchResults(html, searchRule, effectiveBaseUrl, source)
  }

  async getBookInfo(source: BookSource, bookUrl: string): Promise<BookInfo> {
    this.assertRunnableSource(source)
    if (source.mainJs?.trim()) {
      const book = { bookUrl, url: bookUrl }
      const context = this.createRuleContext(source, 'bookInfo', { book, baseUrl: bookUrl })
      const value = this.normalizeMainJsResult(await this.callMainJs(source, 'getBookInfo', context, ['book']))
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { name: '', author: '', coverUrl: '', intro: '', tocUrl: bookUrl }
      }
      const item = value as Record<string, unknown>
      return {
        name: String(item.name || ''), author: String(item.author || ''), intro: String(item.intro || ''),
        coverUrl: resolveAbsoluteUrl(String(item.coverUrl || ''), bookUrl),
        tocUrl: resolveAbsoluteUrl(String(item.tocUrl || bookUrl), bookUrl),
      }
    }
    if (!source.ruleBookInfo) {
      throw new Error('书源未配置 ruleBookInfo')
    }

    const context = this.createRuleContext(source, 'bookInfo', { baseUrl: bookUrl })
    const request = await parseSearchUrlAsync(bookUrl, '', source, 1, context)
    const targetUrl = request.url
    const response = await this.executeRequest(
      source,
      targetUrl,
      request.method,
      request.headers,
      request.body,
      request.charset,
    )

    if (response.status >= 400) {
      throw createHttpError(response, `请求详情页失败 (HTTP ${response.status})`)
    }

    const html = decodeResponse(response.body, response.charset || 'utf-8')
    const effectiveBaseUrl = response.finalUrl || targetUrl
    return await parseBookInfo(html, source.ruleBookInfo, effectiveBaseUrl, { ...context, baseUrl: effectiveBaseUrl })
  }

  async getToc(
    source: BookSource,
    tocUrl: string,
    onProgress?: (info: { page: number; url: string; count: number }) => void,
  ): Promise<TocItem[]> {
    this.assertRunnableSource(source)
    if (source.mainJs?.trim()) {
      const book = { bookUrl: tocUrl, tocUrl }
      const context = this.createRuleContext(source, 'toc', { book, baseUrl: tocUrl })
      const value = this.normalizeMainJsResult(await this.callMainJs(source, 'getChapters', context, ['book']))
      if (!Array.isArray(value)) throw new Error('mainJs getChapters 返回值不是数组')
      return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map(item => ({
          name: String(item.name || item.title || ''),
          url: resolveAbsoluteUrl(String(item.url || item.chapterUrl || ''), tocUrl),
          isVolume: Boolean(item.isVolume), isVip: Boolean(item.isVip), isPay: Boolean(item.isPay),
          updateTime: item.updateTime === undefined ? undefined : String(item.updateTime),
        })).filter(item => item.name && item.url)
    }
    if (!source.ruleToc) {
      throw new Error('书源未配置 ruleToc')
    }

    let url = tocUrl
    const visited = new Set<string>()
    const chapters: TocItem[] = []
    const context = this.createRuleContext(source, 'toc')
    if (source.ruleToc.preUpdateJs?.trim()) {
      const updated = (await executeSourceJavaScript(
        source.bookSourceUrl, source.ruleToc.preUpdateJs, context, url,
      )).result
      if (typeof updated === 'string' && updated.trim()) url = updated.trim()
    }
    for (let page = 1; url && page <= 100; page += 1) {
      const request = await parseSearchUrlAsync(url, '', source, page, context)
      const requestUrl = new URL(request.url)
      requestUrl.hash = ''
      const requestKey = `${request.method}:${requestUrl.href}:${request.body || ''}`
      if (visited.has(requestKey)) break
      visited.add(requestKey)
      const response = await this.executeRequest(source, request.url, request.method, request.headers, request.body, request.charset)
      if (response.status >= 400) throw createHttpError(response, `请求目录页失败 (HTTP ${response.status})`)
      const html = decodeResponse(response.body, response.charset || 'utf-8')
      const effectiveBaseUrl = response.finalUrl || requestUrl.href
      Object.assign(context, { page, baseUrl: effectiveBaseUrl, redirectUrl: response.finalUrl })
      const newChapters = await parseToc(html, source.ruleToc, effectiveBaseUrl, context)
      chapters.push(...newChapters)
      onProgress?.({ page, url: request.url, count: newChapters.length })
      if (!source.ruleToc.nextTocUrl) break
      const doc = html.trim().startsWith('{') || html.trim().startsWith('[')
        ? JSON.parse(html) : new DOMParser().parseFromString(html, 'text/html')
      const next = await parseStringAsync(doc, source.ruleToc.nextTocUrl, {
        ...context, field: 'ruleToc.nextTocUrl',
      })
      url = next ? resolveAbsoluteUrl(next, effectiveBaseUrl) : ''
    }
    return chapters.filter((chapter, index) =>
      chapters.findIndex(other => other.url === chapter.url && other.name === chapter.name) === index)
  }

  async getContent(
    source: BookSource,
    contentUrl: string,
    onProgress?: (info: { page: number; url: string; currentLength: number }) => void,
  ): Promise<OnlineChapterPayload> {
    this.assertRunnableSource(source)
    if (source.mainJs?.trim()) {
      const chapter = { url: contentUrl, chapterUrl: contentUrl }
      const context = this.createRuleContext(source, 'content', { chapter, baseUrl: contentUrl })
      const value = this.normalizeMainJsResult(await this.callMainJs(source, 'getContent', context, ['chapter']))
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
    const context = this.createRuleContext(source, 'content', { baseUrl: contentUrl })
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

      const response = await this.executeRequest(source, request.url, request.method, request.headers, request.body, request.charset)

      if (response.status >= 400) {
        throw createHttpError(response, `请求正文页失败 (HTTP ${response.status})`)
      }

      let html = decodeResponse(response.body, response.charset || 'utf-8')
      const effectiveBaseUrl = response.finalUrl || requestUrl.href
      Object.assign(context, { page, baseUrl: effectiveBaseUrl, redirectUrl: response.finalUrl })
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
      return {
        type: 'images', images,
        title: imagePages.find(payload => payload.title)?.title,
        style: source.ruleContent.imageStyle,
        sourceUrl: contentUrl,
        decodeRule: source.ruleContent.imageDecode,
      }
    }
    return {
      type: 'text',
      text: applyTextReplaceRule(fullContent, source.ruleContent.replaceRegex).trim(),
      title: payloadTitle,
      embeddedImages: embeddedImages.length > 0 ? embeddedImages : undefined,
    }
  }
}
