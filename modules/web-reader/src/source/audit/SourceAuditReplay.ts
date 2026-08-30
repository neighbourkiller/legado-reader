import { parseBookInfo } from '@/source/engine/BookInfoParser'
import { parseContent, parseImageContent } from '@/source/engine/ContentParser'
import { parseSearchResults } from '@/source/engine/SearchParser'
import { parseToc } from '@/source/engine/TocParser'
import type { RuleExecutionContext } from '@/source/engine/RuleTypes'
import type { BookSource, SearchRule } from '@/source/types/BookSource'
import type {
  SourceAuditDiagnosticBundle,
  SourceAuditDiagnosticCase,
  SourceAuditRequestDiagnostic,
} from './SourceAuditDiagnostics'
import type { SourceAuditStage } from './SourceAuditTypes'

export interface SourceAuditReplayResult {
  sourceId: string
  sourceName: string
  stage: SourceAuditStage
  status: 'passed' | 'failed' | 'skipped'
  count?: number
  code?: string
  originalCategory?: string
  rawCode?: string
  field?: string
  responseEligibility: SourceAuditResponseEligibility
  attribution: SourceAuditReplayAttribution
}

export type SourceAuditResponseKind =
  | 'missing' | 'http-error' | 'login' | 'security-challenge'
  | 'empty-shell' | 'target-data' | 'clean-response'

export interface SourceAuditResponseEligibility {
  kind: SourceAuditResponseKind
  replayEligible: boolean
  targetDataEvidence: boolean
  evidence: string
  httpStatus?: number
  contentType?: string
}

export type SourceAuditCandidateCause =
  | 'ONLINE_PIPELINE'
  | 'NETWORK_OR_SITE'
  | 'RULE_OR_ENGINE_SEMANTICS'
  | 'SCRIPT_OR_HOST_SEMANTICS'
  | 'WEBVIEW_RUNTIME'
  | 'ANDROID_API_CAPABILITY'
  | 'UNKNOWN'

export interface SourceAuditReplayAttribution {
  state:
    | 'candidate' | 'unresolved' | 'ineligible_response'
    | 'blocked_missing_target_data' | 'blocked_missing_field'
    | 'ready_for_differential'
  candidateCause: SourceAuditCandidateCause
  evidence: string
  confirmationRequired?: 'ANDROID_DIFFERENTIAL' | 'LIVE_PIPELINE_INVESTIGATION' | 'CAPABILITY_ASSESSMENT'
}

export interface SourceAuditReplayReport {
  schemaVersion: 1
  kind: 'source-audit-replay'
  generatedAt: number
  sourceEngineVersion: number
  audit: SourceAuditDiagnosticBundle['audit']
  summary: SourceAuditReplaySummary
  results: SourceAuditReplayResult[]
}

export interface SourceAuditReplaySummary {
  resultCount: number
  byStatus: Record<string, number>
  byAttributionState: Record<string, number>
  byCandidateCause: Record<string, number>
  byResponseKind: Record<string, number>
  readyForDifferential: number
}

function responseForStage(item: SourceAuditDiagnosticCase, stage: SourceAuditStage) {
  return [...item.requests].reverse().find(request => request.stage === stage && Boolean(request.transformedBody ?? request.body))
}

function responseBody(request: SourceAuditRequestDiagnostic) {
  return request.transformedBody ?? request.body ?? ''
}

function headerValue(headers: Record<string, string> | undefined, name: string): string | undefined {
  return Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
}

function failureCategory(item: SourceAuditDiagnosticCase, stage: SourceAuditStage): string | undefined {
  return item.failures?.[stage]?.category || item.failedStages[stage]?.code
}

function targetReferences(item: SourceAuditDiagnosticCase): string[] {
  const book = item.debug.book || {}
  const chapter = item.debug.chapter || {}
  return [
    item.debug.keyword,
    item.debug.exploreName,
    book.name,
    book.title,
    chapter.name,
    chapter.title,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length >= 2)
}

export function classifyReplayResponse(
  item: SourceAuditDiagnosticCase,
  stage: SourceAuditStage,
): SourceAuditResponseEligibility {
  const request = responseForStage(item, stage)
  if (!request) {
    return {
      kind: 'missing', replayEligible: false, targetDataEvidence: false, evidence: 'MISSING_RESPONSE',
    }
  }
  const status = request.status
  const contentType = headerValue(request.responseHeaders, 'content-type')
  const originalCategory = failureCategory(item, stage)
  const base = { httpStatus: status, contentType }
  if (originalCategory === 'SECURITY_CHALLENGE') {
    return {
      ...base, kind: 'security-challenge', replayEligible: false,
      targetDataEvidence: false, evidence: 'ORIGINAL_SECURITY_CHALLENGE',
    }
  }
  if (originalCategory === 'NEEDS_LOGIN') {
    return {
      ...base, kind: 'login', replayEligible: false,
      targetDataEvidence: false, evidence: 'ORIGINAL_NEEDS_LOGIN',
    }
  }
  if (originalCategory === 'HTTP_ERROR' || (typeof status === 'number' && status >= 400)) {
    return {
      ...base, kind: 'http-error', replayEligible: false,
      targetDataEvidence: false, evidence: 'NON_SUCCESS_HTTP_RESPONSE',
    }
  }
  const body = responseBody(request)
  const sample = body.slice(0, 256 * 1024)
  if (!sample.trim()) {
    return {
      ...base, kind: 'empty-shell', replayEligible: false,
      targetDataEvidence: false, evidence: 'EMPTY_RESPONSE_SHELL',
    }
  }
  if (/(?:cf-chl-|cloudflare|just a moment|captcha|验证码|安全验证|访问验证|人机验证)/i.test(sample)) {
    return {
      ...base, kind: 'security-challenge', replayEligible: false,
      targetDataEvidence: false, evidence: 'CHALLENGE_MARKER',
    }
  }
  if (/<form\b[^>]*>[\s\S]*?(?:type=["']?password|登录|sign[ -]?in)/i.test(sample)) {
    return {
      ...base, kind: 'login', replayEligible: false,
      targetDataEvidence: false, evidence: 'LOGIN_FORM_MARKER',
    }
  }
  const hasTargetData = targetReferences(item).some(reference => sample.includes(reference))
  return {
    ...base,
    kind: hasTargetData ? 'target-data' : 'clean-response',
    replayEligible: true,
    targetDataEvidence: hasTargetData,
    evidence: hasTargetData ? 'KNOWN_TARGET_REFERENCE_PRESENT' : 'NO_ERROR_SHELL_DETECTED',
  }
}

function baseUrl(request: SourceAuditRequestDiagnostic, source: BookSource) {
  return request.finalUrl || request.url || source.bookSourceUrl
}

function ruleForExplore(source: BookSource): SearchRule | undefined {
  const rule = source.ruleExplore || source.ruleSearch
  if (!rule) return undefined
  return {
    bookList: rule.bookList,
    name: rule.name,
    author: rule.author,
    intro: rule.intro,
    kind: rule.kind,
    lastChapter: rule.lastChapter,
    updateTime: rule.updateTime,
    bookUrl: rule.bookUrl,
    coverUrl: rule.coverUrl,
    wordCount: rule.wordCount,
  }
}

function attributionFor(
  item: SourceAuditDiagnosticCase,
  stage: SourceAuditStage,
  replayStatus: SourceAuditReplayResult['status'],
  responseEligibility: SourceAuditResponseEligibility,
  replayCode?: string,
): SourceAuditReplayAttribution {
  const failure = item.failures?.[stage]
  const originalCategory = failure?.category || item.failedStages[stage]?.code
  const rawCode = failure?.rawCode || replayCode
  if (replayCode === 'MISSING_RESPONSE' || replayCode === 'NOT_REPLAYABLE') {
    const networkCategory = ['NETWORK_ERROR', 'DNS_ERROR', 'TIMEOUT', 'HTTP_ERROR', 'SECURITY_CHALLENGE', 'NEEDS_LOGIN']
      .includes(String(originalCategory))
    return {
      state: networkCategory ? 'candidate' : 'unresolved',
      candidateCause: networkCategory ? 'NETWORK_OR_SITE' : 'UNKNOWN',
      evidence: replayCode,
    }
  }
  if (!responseEligibility.replayEligible) {
    return {
      state: 'ineligible_response',
      candidateCause: 'NETWORK_OR_SITE',
      evidence: responseEligibility.evidence,
    }
  }
  if (replayStatus === 'passed') {
    return {
      state: 'candidate',
      candidateCause: 'ONLINE_PIPELINE',
      evidence: 'ONLINE_FAILED_OFFLINE_PASSED',
      confirmationRequired: 'LIVE_PIPELINE_INVESTIGATION',
    }
  }
  if (originalCategory === 'UNSUPPORTED_ANDROID_API' || rawCode === 'UNSUPPORTED_ANDROID_API') {
    return {
      state: 'candidate',
      candidateCause: 'ANDROID_API_CAPABILITY',
      evidence: 'EXPLICIT_UNSUPPORTED_ANDROID_API',
      confirmationRequired: 'CAPABILITY_ASSESSMENT',
    }
  }
  if (originalCategory === 'WEBVIEW_ERROR' || /^WEBJS_/.test(String(rawCode))) {
    return {
      state: 'candidate',
      candidateCause: 'WEBVIEW_RUNTIME',
      evidence: 'OFFLINE_REPLAY_FAILED',
      confirmationRequired: 'LIVE_PIPELINE_INVESTIGATION',
    }
  }
  if (originalCategory === 'JS_EXECUTION_ERROR' || /^(?:JS_|UNSUPPORTED_JAVASCRIPT)/.test(String(rawCode))) {
    return {
      state: 'ready_for_differential',
      candidateCause: 'SCRIPT_OR_HOST_SEMANTICS',
      evidence: 'OFFLINE_REPLAY_REPRODUCED',
      confirmationRequired: 'ANDROID_DIFFERENTIAL',
    }
  }
  if (originalCategory === 'RULE_SYNTAX_ERROR' || originalCategory === 'EMPTY_RESULT'
    || /^(?:INVALID_|RULE_EXECUTION_FAILED)/.test(String(rawCode)) || replayCode === 'EMPTY_RESULT') {
    const field = failure?.field || item.failedStages[stage]?.field
    if (!field) {
      return {
        state: 'blocked_missing_field', candidateCause: 'RULE_OR_ENGINE_SEMANTICS',
        evidence: 'FAILED_FIELD_NOT_RECORDED', confirmationRequired: 'ANDROID_DIFFERENTIAL',
      }
    }
    if ((originalCategory === 'EMPTY_RESULT' || replayCode === 'EMPTY_RESULT')
      && !responseEligibility.targetDataEvidence) {
      return {
        state: 'blocked_missing_target_data', candidateCause: 'RULE_OR_ENGINE_SEMANTICS',
        evidence: 'TARGET_DATA_NOT_ESTABLISHED', confirmationRequired: 'ANDROID_DIFFERENTIAL',
      }
    }
    return {
      state: 'ready_for_differential',
      candidateCause: 'RULE_OR_ENGINE_SEMANTICS',
      evidence: 'OFFLINE_REPLAY_REPRODUCED',
      confirmationRequired: 'ANDROID_DIFFERENTIAL',
    }
  }
  return { state: 'unresolved', candidateCause: 'UNKNOWN', evidence: 'INSUFFICIENT_EVIDENCE' }
}

function createReplayResult(
  item: SourceAuditDiagnosticCase,
  stage: SourceAuditStage,
  result: Omit<SourceAuditReplayResult, 'sourceId' | 'sourceName' | 'stage' | 'originalCategory' | 'rawCode' | 'field' | 'responseEligibility' | 'attribution'>,
): SourceAuditReplayResult {
  const failure = item.failures?.[stage]
  const replayRawCode = /^(?:INVALID_|RULE_EXECUTION_FAILED|JS_|WEBJS_|UNSUPPORTED_)/.test(result.code || '')
    ? result.code
    : undefined
  const responseEligibility = classifyReplayResponse(item, stage)
  return {
    sourceId: item.sourceId,
    sourceName: item.sourceName,
    stage,
    ...result,
    originalCategory: failure?.category || item.failedStages[stage]?.code,
    rawCode: failure?.rawCode || replayRawCode,
    field: failure?.field || item.failedStages[stage]?.field,
    responseEligibility,
    attribution: attributionFor(item, stage, result.status, responseEligibility, result.code),
  }
}

function countBy(values: Array<string | undefined>): Record<string, number> {
  const result: Record<string, number> = {}
  for (const value of values) {
    const key = value || 'UNKNOWN'
    result[key] = (result[key] || 0) + 1
  }
  return result
}

export function summarizeSourceAuditReplay(results: SourceAuditReplayResult[]): SourceAuditReplaySummary {
  return {
    resultCount: results.length,
    byStatus: countBy(results.map(item => item.status)),
    byAttributionState: countBy(results.map(item => item.attribution.state)),
    byCandidateCause: countBy(results.map(item => item.attribution.candidateCause)),
    byResponseKind: countBy(results.map(item => item.responseEligibility.kind)),
    readyForDifferential: results.filter(item => item.attribution.state === 'ready_for_differential').length,
  }
}

async function replayStage(item: SourceAuditDiagnosticCase, stage: SourceAuditStage): Promise<number | undefined> {
  const request = responseForStage(item, stage)
  if (!request) return undefined
  const source = item.source
  const variables = new Map(Object.entries(source.variableMap || {}))
  const context: Partial<RuleExecutionContext> = {
    compatibilityMode: source.webReaderCompatibilityMode || 'legado',
    stage: stage as RuleExecutionContext['stage'],
    source: source as unknown as Record<string, unknown>,
    book: item.debug.book,
    chapter: item.debug.chapter,
    key: item.debug.keyword,
    variables,
  }
  const body = responseBody(request)
  const url = baseUrl(request, source)
  if (stage === 'search' && source.ruleSearch) {
    return (await parseSearchResults(body, source.ruleSearch, url, source, context)).length
  }
  if (stage === 'explore') {
    const rule = ruleForExplore(source)
    return rule ? (await parseSearchResults(body, rule, url, source, { ...context, stage: 'explore' })).length : 0
  }
  if (stage === 'bookInfo' && source.ruleBookInfo) {
    const info = await parseBookInfo(body, source.ruleBookInfo, url, context)
    return info.name || item.debug.book?.name ? 1 : 0
  }
  if (stage === 'toc' && source.ruleToc) {
    return (await parseToc(body, source.ruleToc, url, context)).length
  }
  if (stage === 'content' && source.ruleContent) {
    if (source.bookSourceType === 2) {
      return (await parseImageContent(body, source.ruleContent, url, context)).payload.images.length
    }
    return (await parseContent(body, source.ruleContent, url, context)).content.trim() ? 1 : 0
  }
  return undefined
}

export async function replaySourceAuditBundle(bundle: SourceAuditDiagnosticBundle): Promise<SourceAuditReplayReport> {
  if (bundle.schemaVersion !== 1 || bundle.kind !== 'source-audit-diagnostics' || !Array.isArray(bundle.cases)) {
    throw new Error('不支持的书源诊断包格式')
  }
  const results: SourceAuditReplayResult[] = []
  for (const item of bundle.cases) {
    for (const stage of Object.keys(item.failedStages) as SourceAuditStage[]) {
      if (!['search', 'explore', 'bookInfo', 'toc', 'content'].includes(stage)) {
        results.push(createReplayResult(item, stage, { status: 'skipped', code: 'NOT_REPLAYABLE' }))
        continue
      }
      try {
        const count = await replayStage(item, stage)
        results.push(createReplayResult(item, stage, {
          status: count === undefined ? 'skipped' : count > 0 ? 'passed' : 'failed',
          count,
          code: count === undefined ? 'MISSING_RESPONSE' : count > 0 ? undefined : 'EMPTY_RESULT',
        }))
      } catch (error) {
        const value = error as { code?: unknown }
        results.push(createReplayResult(item, stage, {
          status: 'failed',
          code: value?.code ? String(value.code) : 'REPLAY_ERROR',
        }))
      }
    }
  }
  return {
    schemaVersion: 1,
    kind: 'source-audit-replay',
    generatedAt: Date.now(),
    sourceEngineVersion: bundle.engineVersion,
    audit: bundle.audit,
    summary: summarizeSourceAuditReplay(results),
    results,
  }
}
