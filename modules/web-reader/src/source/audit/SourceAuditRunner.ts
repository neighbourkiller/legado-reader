import type { BookInfo } from '@/source/engine/BookInfoParser'
import { inspectSourceCompatibility } from '@/source/engine/Compatibility'
import { parseExploreUrlOptions } from '@/source/engine/SourceDebugHelper'
import {
  SecurityChallengeError,
  SourceEngine,
  type SourceEngineRequestTrace,
  type TocExecutionOptions,
} from '@/source/engine/SourceEngine'
import { RuleExecutionError } from '@/source/engine/RuleTypes'
import type { TocItem } from '@/source/engine/TocParser'
import { SourceTransportError } from '@/source/transport/SourceTransport'
import type { BookSource, OnlineChapterPayload, SearchResult } from '@/source/types/BookSource'
import {
  SOURCE_AUDIT_SCHEMA_VERSION,
  SOURCE_AUDIT_STAGES,
  SOURCE_ENGINE_VERSION,
  type SourceAuditDebugContext,
  type SourceAuditEntry,
  type SourceAuditErrorCategory,
  type SourceAuditMode,
  type SourceAuditRun,
  type SourceAuditRunSummary,
  type SourceAuditStage,
  type SourceAuditStageResult,
} from './SourceAuditTypes'
import {
  createSourceAuditDiagnosticBundle,
  sanitizeRequestTrace,
  sanitizeFailureDiagnostic,
  type SourceAuditDiagnosticBundle,
  type SourceAuditFailureDiagnostic,
  type SourceAuditRequestDiagnostic,
} from './SourceAuditDiagnostics'

export interface SourceAuditEngine {
  search(source: BookSource, keyword: string, onProgress?: (info: {
    status: number
    finalUrl: string
    bodyLength: number
    channel?: string
  }) => void, page?: number): Promise<SearchResult[]>
  explore(source: BookSource, exploreUrl?: string, page?: number, onProgress?: (info: {
    status: number
    finalUrl: string
    bodyLength: number
    channel?: string
  }) => void): Promise<SearchResult[]>
  getBookInfo(source: BookSource, book: SearchResult): Promise<BookInfo>
  getToc(source: BookSource, book: SearchResult & Partial<BookInfo>, onProgress?: (info: {
    page: number
    url: string
    count: number
  }) => void, options?: TocExecutionOptions): Promise<TocItem[]>
  getContent(source: BookSource, chapter: TocItem, onProgress?: unknown, book?: Record<string, unknown>): Promise<OnlineChapterPayload>
  checkLogin(source: BookSource): Promise<{ checked: boolean; loggedIn: boolean; detail?: string }>
  fetchSourceAsset(source: BookSource, url: string, refererUrl: string): Promise<{ body: Uint8Array; mime: string }>
}

export interface SourceAuditRunnerOptions {
  mode: SourceAuditMode
  concurrency?: number
  fallbackKeyword?: string
  engineFactory?: () => SourceAuditEngine
  idFactory?: (sourceUrl: string) => Promise<string>
  onUpdate?: (run: SourceAuditRun) => void
  /** 仅在用户显式指定私有诊断目录时启用，响应正文不会进入普通历史报告。 */
  captureDiagnostics?: boolean
}

export interface ClassifiedAuditError {
  code: SourceAuditErrorCategory | string
  field?: string
  status: 'failed' | 'unsupported' | 'needs-action'
}

const MAX_DIAGNOSTIC_TRACES_PER_SOURCE = 8
const MAX_DIAGNOSTIC_BODY_CHARS = 32 * 1024 * 1024

class AuditEmptyResultError extends Error {
  readonly code = 'EMPTY_RESULT'

  constructor(readonly field: string) {
    super(field)
    this.name = 'AuditEmptyResultError'
  }
}

function normalizedName(error: unknown): string {
  return error instanceof Error ? error.name.toUpperCase() : ''
}

export function classifySourceAuditError(error: unknown): ClassifiedAuditError {
  if (error instanceof AuditEmptyResultError) {
    return { code: 'EMPTY_RESULT', field: error.field, status: 'failed' }
  }
  if (error instanceof SecurityChallengeError) {
    return { code: 'SECURITY_CHALLENGE', status: 'needs-action' }
  }
  if (error instanceof RuleExecutionError) {
    const status = error.code === 'UNSUPPORTED_ANDROID_API' ? 'unsupported' : 'failed'
    let code: SourceAuditErrorCategory = 'RULE_SYNTAX_ERROR'
    if (error.code === 'UNSUPPORTED_ANDROID_API') code = 'UNSUPPORTED_ANDROID_API'
    else if (/^(?:WEBJS_|UNSUPPORTED_WEBJS)/.test(error.code)) code = 'WEBVIEW_ERROR'
    else if (/^(?:JS_|UNSUPPORTED_JAVASCRIPT)/.test(error.code)) code = 'JS_EXECUTION_ERROR'
    return { code, field: error.field, status }
  }
  if (error instanceof SourceTransportError) {
    if (error.code === 'REQUEST_TIMEOUT') return { code: 'TIMEOUT', status: 'failed' }
    if (error.code === 'DNS_RESOLUTION_FAILED') return { code: 'DNS_ERROR', status: 'failed' }
    if (/WEBVIEW/i.test(error.code)) return { code: 'WEBVIEW_ERROR', status: 'failed' }
    return { code: 'NETWORK_ERROR', status: 'failed' }
  }
  const value = error as { code?: unknown; status?: unknown; message?: unknown }
  const code = String(value?.code || '')
  const name = normalizedName(error)
  const message = String(value?.message || error || '')
  if (Number(value?.status) === 401) return { code: 'NEEDS_LOGIN', status: 'needs-action' }
  if (code === 'HTTP_ERROR' || name === 'SOURCEHTTPERROR') return { code: 'HTTP_ERROR', status: 'failed' }
  if (/UNSUPPORTED_ANDROID|UNSUPPORTED_JAVA|UNSUPPORTED_SOURCE_TYPE/.test(code || name)) {
    return { code: 'UNSUPPORTED_ANDROID_API', status: 'unsupported' }
  }
  if (/TIMEOUT|TIMED OUT|ABORT/.test(`${code} ${name} ${message}`.toUpperCase())) {
    return { code: 'TIMEOUT', status: 'failed' }
  }
  if (/DNS|NAME RESOLUTION|LOOKUP/.test(`${code} ${message}`.toUpperCase())) {
    return { code: 'DNS_ERROR', status: 'failed' }
  }
  if (/WEBVIEW/.test(`${code} ${name} ${message}`.toUpperCase())) {
    return { code: 'WEBVIEW_ERROR', status: 'failed' }
  }
  if (/LOGIN|未登录|登录/.test(`${code} ${name} ${message}`.toUpperCase())) {
    return { code: 'NEEDS_LOGIN', status: 'needs-action' }
  }
  if (/JS_|JAVASCRIPT|QUICKJS/.test(`${code} ${name}`.toUpperCase())) {
    return { code: 'JS_EXECUTION_ERROR', status: 'failed' }
  }
  if (/图片解密|IMAGEDECODE|IMAGE_DECODE/i.test(`${code} ${name} ${message}`)) {
    return { code: 'JS_EXECUTION_ERROR', status: 'failed' }
  }
  if (name === 'RESPONSE_ENCODING_ERROR') return { code: 'NETWORK_ERROR', status: 'failed' }
  return { code: 'UNKNOWN_ERROR', status: 'failed' }
}

function fallbackHash(input: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export async function createSourceAuditId(sourceUrl: string): Promise<string> {
  if (!globalThis.crypto?.subtle) return fallbackHash(sourceUrl)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(sourceUrl))
  return Array.from(new Uint8Array(digest)).slice(0, 6)
    .map(value => value.toString(16).padStart(2, '0')).join('')
}

function createSkipped(code: string): SourceAuditStageResult {
  return { status: 'skipped', code }
}

export function summarizeSourceAuditRun(run: Pick<SourceAuditRun, 'entries'>): SourceAuditRunSummary {
  const verificationStatus: Record<string, number> = {}
  const stageStatus: Record<string, Record<string, number>> = {}
  const errorCodes: Record<string, number> = {}
  for (const entry of run.entries) {
    verificationStatus[entry.verificationStatus] = (verificationStatus[entry.verificationStatus] || 0) + 1
    for (const [stage, result] of Object.entries(entry.stages)) {
      if (!result) continue
      const statuses = stageStatus[stage] ||= {}
      statuses[result.status] = (statuses[result.status] || 0) + 1
      if (result.code) errorCodes[result.code] = (errorCodes[result.code] || 0) + 1
    }
  }
  return { sourceCount: run.entries.length, verificationStatus, stageStatus, errorCodes }
}

function nonVolumeChapters(chapters: TocItem[]): TocItem[] {
  return chapters.filter(chapter => !chapter.isVolume && Boolean(chapter.url))
}

function sampleChapters(chapters: TocItem[], mode: SourceAuditMode): TocItem[] {
  if (mode === 'quick') return chapters.slice(0, 1)
  if (chapters.length <= 3) return chapters
  const indices = [0, Math.floor((chapters.length - 1) / 2), chapters.length - 1]
  return [...new Set(indices)].map(index => chapters[index])
}

function hasPayloadContent(payload: OnlineChapterPayload): boolean {
  return payload.type === 'images' ? payload.images.length > 0 : payload.text.trim().length > 0
}

function imageFromPayload(payload: OnlineChapterPayload) {
  if (payload.type === 'images') return payload.images[0]
  return payload.embeddedImages?.[0]
}

export class SourceAuditRunner {
  private stopped = false
  private readonly debugContexts = new Map<string, SourceAuditDebugContext>()
  private readonly traces = new Map<string, SourceAuditRequestDiagnostic[]>()
  private readonly failures = new Map<string, Partial<Record<SourceAuditStage, SourceAuditFailureDiagnostic>>>()
  private capturedDiagnosticBodyChars = 0
  private activeRun?: SourceAuditRun
  private readonly engineFactory: () => SourceAuditEngine
  private readonly idFactory: (sourceUrl: string) => Promise<string>
  private readonly concurrency: number

  constructor(private readonly options: SourceAuditRunnerOptions) {
    this.engineFactory = options.engineFactory || (() => new SourceEngine({
      persistSourceVariables: false,
      onRequestTrace: options.captureDiagnostics ? trace => this.recordTrace(trace) : undefined,
    }))
    this.idFactory = options.idFactory || createSourceAuditId
    this.concurrency = Math.min(3, Math.max(1, Math.trunc(options.concurrency ?? 1)))
  }

  stop() {
    this.stopped = true
  }

  getDebugInput(sourceId: string, stage: SourceAuditStage): string | undefined {
    const context = this.debugContexts.get(sourceId)
    if (!context) return undefined
    if (stage === 'search') return context.keyword
    if (stage === 'explore' && context.exploreUrl) return `${context.exploreName || '发现'}::${context.exploreUrl}`
    if (stage === 'bookInfo') return context.bookUrl
    if (stage === 'toc' && context.tocUrl) return `++${context.tocUrl}`
    if ((stage === 'content' || stage === 'image') && context.chapterUrl) return `--${context.chapterUrl}`
    return undefined
  }

  createDiagnosticBundle(run: SourceAuditRun, sources: BookSource[]): SourceAuditDiagnosticBundle {
    return createSourceAuditDiagnosticBundle(run, sources, this.traces, this.debugContexts, this.failures)
  }

  private recordFailure(
    sourceId: string,
    stage: SourceAuditStage,
    error: unknown,
    classified: ClassifiedAuditError,
  ) {
    const items = this.failures.get(sourceId) || {}
    items[stage] = sanitizeFailureDiagnostic(error, stage, classified)
    this.failures.set(sourceId, items)
  }

  private recordTrace(trace: SourceEngineRequestTrace) {
    const items = this.traces.get(trace.sourceId) || []
    const sanitized = sanitizeRequestTrace(trace)
    const bodyChars = (sanitized.body?.length || 0) + (sanitized.transformedBody?.length || 0)
    if (this.capturedDiagnosticBodyChars + bodyChars > MAX_DIAGNOSTIC_BODY_CHARS) {
      if (sanitized.body) sanitized.bodyTruncated = true
      if (sanitized.transformedBody) sanitized.transformedBodyTruncated = true
      sanitized.body = undefined
      sanitized.transformedBody = undefined
    } else {
      this.capturedDiagnosticBodyChars += bodyChars
    }
    if (items.length >= MAX_DIAGNOSTIC_TRACES_PER_SOURCE) items.splice(4, 1)
    items.push(sanitized)
    this.traces.set(trace.sourceId, items)
  }

  async run(sources: BookSource[]): Promise<SourceAuditRun> {
    this.stopped = false
    this.activeRun = undefined
    this.debugContexts.clear()
    this.traces.clear()
    this.failures.clear()
    this.capturedDiagnosticBodyChars = 0
    const entries = await Promise.all(sources.map(source => this.createEntry(source)))
    const run: SourceAuditRun = {
      schemaVersion: SOURCE_AUDIT_SCHEMA_VERSION,
      engineVersion: SOURCE_ENGINE_VERSION,
      mode: this.options.mode,
      startedAt: Date.now(),
      status: 'running',
      entries,
    }
    this.activeRun = run
    this.emit()

    let nextIndex = 0
    const worker = async () => {
      while (!this.stopped) {
        const index = nextIndex
        nextIndex += 1
        if (index >= sources.length) return
        await this.runSource(sources[index], entries[index], this.engineFactory())
      }
    }
    await Promise.all(Array.from({ length: this.concurrency }, () => worker()))

    if (this.stopped) {
      for (let index = nextIndex; index < entries.length; index += 1) {
        this.skipRemaining(entries[index], 'CANCELLED')
      }
    }
    run.status = this.stopped ? 'cancelled' : 'completed'
    run.completedAt = Date.now()
    run.summary = summarizeSourceAuditRun(run)
    this.emit()
    return run
  }

  private async createEntry(source: BookSource): Promise<SourceAuditEntry> {
    const report = inspectSourceCompatibility(source)
    const targetType = source.bookSourceType === 0 || source.bookSourceType === 2
    const staticStatus = !targetType || report.status === 'unsupported' ? 'unsupported' : 'passed'
    const entry: SourceAuditEntry = {
      sourceId: await this.idFactory(source.bookSourceUrl),
      sourceName: source.bookSourceName,
      sourceType: Number.isInteger(source.bookSourceType) ? source.bookSourceType : null,
      capabilities: report.capabilities || [],
      stages: {
        static: {
          status: staticStatus,
          code: staticStatus === 'unsupported' ? report.issues[0]?.code || 'UNSUPPORTED_SOURCE_TYPE' : undefined,
          count: report.issues.length,
        },
      },
      verificationStatus: 'untested',
    }
    if (staticStatus === 'unsupported') this.skipRemaining(entry, 'DEPENDENCY_UNSUPPORTED')
    return entry
  }

  private emit() {
    if (!this.activeRun) return
    this.options.onUpdate?.(structuredClone(this.activeRun))
  }

  private setStage(entry: SourceAuditEntry, stage: SourceAuditStage, result: SourceAuditStageResult) {
    entry.stages[stage] = result
    this.emit()
  }

  private skipRemaining(entry: SourceAuditEntry, code: string, from?: SourceAuditStage) {
    const start = from ? SOURCE_AUDIT_STAGES.indexOf(from) : 1
    for (const stage of SOURCE_AUDIT_STAGES.slice(Math.max(1, start))) {
      if (!entry.stages[stage]) entry.stages[stage] = createSkipped(code)
    }
    this.emit()
  }

  private async executeStage<T>(
    entry: SourceAuditEntry,
    stage: SourceAuditStage,
    action: () => Promise<T>,
    count?: (value: T) => number,
  ): Promise<T | undefined> {
    if (this.stopped) {
      this.setStage(entry, stage, createSkipped('CANCELLED'))
      return undefined
    }
    const startedAt = performance.now()
    this.setStage(entry, stage, { status: 'running' })
    try {
      const value = await action()
      const channel = entry.stages[stage]?.channel
      this.setStage(entry, stage, {
        status: 'passed',
        durationMs: Math.round(performance.now() - startedAt),
        count: count?.(value),
        channel,
      })
      return value
    } catch (error) {
      if ((error as { code?: string })?.code === 'CANCELLED') {
        this.setStage(entry, stage, {
          status: 'skipped',
          code: 'CANCELLED',
          durationMs: Math.round(performance.now() - startedAt),
        })
        return undefined
      }
      const classified = classifySourceAuditError(error)
      this.recordFailure(entry.sourceId, stage, error, classified)
      const channel = entry.stages[stage]?.channel
      this.setStage(entry, stage, {
        status: classified.status,
        code: classified.code,
        field: classified.field,
        durationMs: Math.round(performance.now() - startedAt),
        channel,
      })
      return undefined
    }
  }

  private async runSource(source: BookSource, entry: SourceAuditEntry, engine: SourceAuditEngine) {
    if (entry.stages.static?.status === 'unsupported') return
    const debug: SourceAuditDebugContext = {}
    this.debugContexts.set(entry.sourceId, debug)

    if (this.options.mode === 'full' && source.loginCheckJs?.trim()) {
      const login = await this.executeStage(entry, 'login', async () => {
        const result = await engine.checkLogin(source)
        if (result.checked && !result.loggedIn) throw Object.assign(new Error('NEEDS_LOGIN'), { code: 'NEEDS_LOGIN' })
        return result
      })
      if (!login) {
        const dependencyCode = entry.stages.login?.status === 'needs-action'
          ? 'DEPENDENCY_NEEDS_LOGIN' : 'DEPENDENCY_LOGIN'
        this.skipRemaining(entry, dependencyCode, 'search')
        return
      }
    } else {
      this.setStage(entry, 'login', createSkipped(source.loginCheckJs?.trim() ? 'QUICK_MODE' : 'NOT_CONFIGURED'))
    }

    if (this.options.mode === 'full' && source.exploreUrl?.trim()) {
      const option = parseExploreUrlOptions(source.exploreUrl)[0]
      const exploreUrl = option?.url || source.exploreUrl
      debug.exploreName = option?.title || '发现'
      debug.exploreUrl = exploreUrl
      await this.executeStage(entry, 'explore', async () => {
        const results = await engine.explore(source, exploreUrl, 1, info => {
          const stage = entry.stages.explore
          if (stage) stage.channel = info.channel === 'webview' ? 'webview' : 'reqwest'
        })
        if (results.length === 0) throw new AuditEmptyResultError('ruleExplore.bookList')
        return results
      }, value => value.length)
    } else {
      this.setStage(entry, 'explore', createSkipped(this.options.mode === 'quick' ? 'QUICK_MODE' : 'NOT_CONFIGURED'))
    }

    const keyword = source.ruleSearch?.checkKeyWord?.trim() || this.options.fallbackKeyword || '系统'
    debug.keyword = keyword
    const searchResults = await this.executeStage(entry, 'search', async () => {
      const results = await engine.search(source, keyword, info => {
        const stage = entry.stages.search
        if (stage) stage.channel = info.channel === 'webview' ? 'webview' : 'reqwest'
      })
      if (results.length === 0) throw new AuditEmptyResultError('ruleSearch.bookList')
      return results
    }, value => value.length)
    if (!searchResults) {
      this.skipRemaining(entry, 'DEPENDENCY_SEARCH', 'bookInfo')
      return
    }

    const searchBook = searchResults[0]
    debug.bookUrl = searchBook.bookUrl
    debug.book = structuredClone(searchBook as unknown as Record<string, unknown>)
    const info = await this.executeStage(entry, 'bookInfo', async () => {
      const value = await engine.getBookInfo(source, searchBook)
      if (!value.name && !searchBook.name) throw new AuditEmptyResultError('ruleBookInfo.name')
      return value
    })
    if (!info) {
      this.skipRemaining(entry, 'DEPENDENCY_BOOK_INFO', 'toc')
      return
    }

    const book: SearchResult & BookInfo = {
      ...searchBook,
      ...info,
      name: info.name || searchBook.name,
      author: info.author || searchBook.author,
      bookUrl: searchBook.bookUrl,
      tocUrl: info.tocUrl || searchBook.bookUrl,
      variableMap: (searchBook.variableMap || info.variableMap)
        ? { ...searchBook.variableMap, ...info.variableMap }
        : undefined,
    }
    debug.tocUrl = book.tocUrl
    debug.book = structuredClone(book as unknown as Record<string, unknown>)
    const chapters = await this.executeStage(entry, 'toc', async () => {
      const value = await engine.getToc(source, book, undefined, {
        maxPages: this.options.mode === 'quick' ? 1 : 100,
      })
      if (nonVolumeChapters(value).length === 0) throw new AuditEmptyResultError('ruleToc.chapterList')
      return value
    }, value => value.length)
    if (!chapters) {
      this.skipRemaining(entry, 'DEPENDENCY_TOC', 'content')
      return
    }

    const samples = sampleChapters(nonVolumeChapters(chapters), this.options.mode)
    debug.chapterUrl = samples[0]?.url
    debug.chapter = samples[0] ? structuredClone(samples[0] as unknown as Record<string, unknown>) : undefined
    const payloads = await this.executeStage(entry, 'content', async () => {
      const values: OnlineChapterPayload[] = []
      for (const chapter of samples) {
        if (this.stopped) break
        const payload = await engine.getContent(source, chapter, undefined, book as unknown as Record<string, unknown>)
        if (!hasPayloadContent(payload)) throw new AuditEmptyResultError('ruleContent.content')
        values.push(payload)
      }
      if (values.length !== samples.length) throw Object.assign(new Error('CANCELLED'), { code: 'CANCELLED' })
      return values
    }, value => value.length)
    if (!payloads) {
      this.setStage(entry, 'image', createSkipped('DEPENDENCY_CONTENT'))
      return
    }

    if (this.options.mode === 'full' && source.bookSourceType === 2) {
      const image = payloads.map(imageFromPayload).find(Boolean)
      await this.executeStage(entry, 'image', async () => {
        if (!image) throw new AuditEmptyResultError('ruleContent.content.image')
        const result = await engine.fetchSourceAsset(source, image.url, debug.chapterUrl || book.tocUrl)
        if (result.body.length === 0) throw new AuditEmptyResultError('ruleContent.imageDecode')
        return result
      }, value => value.body.length)
    } else {
      this.setStage(entry, 'image', createSkipped(this.options.mode === 'quick' ? 'QUICK_MODE' : 'NOT_IMAGE_SOURCE'))
    }

    const requiredStages: SourceAuditStage[] = ['static', 'search', 'bookInfo', 'toc', 'content']
    if (this.options.mode === 'full' && source.loginCheckJs?.trim()) requiredStages.push('login')
    if (this.options.mode === 'full' && source.exploreUrl?.trim()) requiredStages.push('explore')
    if (this.options.mode === 'full' && source.bookSourceType === 2) requiredStages.push('image')
    if (requiredStages.every(stage => entry.stages[stage]?.status === 'passed')) {
      entry.verificationStatus = 'live-passed'
      this.emit()
    }
  }
}
