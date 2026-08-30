import type { SourceEngineRequestTrace } from '@/source/engine/SourceEngine'
import type { BookSource } from '@/source/types/BookSource'
import type {
  SourceAuditErrorCategory,
  SourceAuditDebugContext,
  SourceAuditEntry,
  SourceAuditRun,
  SourceAuditStage,
  SourceAuditStageStatus,
} from './SourceAuditTypes'

const MAX_CAPTURED_BODY_BYTES = 512 * 1024
const SECRET_KEY = /(?:authorization|cookie|token|password|passwd|secret|credential|logininfo)/i
const SAFE_REQUEST_HEADERS = new Set(['accept', 'content-type', 'referer', 'user-agent', 'origin'])
const SAFE_RESPONSE_HEADERS = new Set(['content-type', 'content-encoding', 'location', 'server'])
const SECRET_QUERY_KEY = /(?:token|auth|key|secret|password|passwd|session|sign|signature|code)/i

export interface SourceAuditRequestDiagnostic {
  stage: SourceAuditStage | 'unknown'
  method: string
  url: string
  requestHeaders: Record<string, string>
  requestBodyLength: number
  status?: number
  finalUrl?: string
  responseHeaders?: Record<string, string>
  charset?: string
  channel?: 'reqwest' | 'webview'
  body?: string
  bodyBytes?: number
  bodyTruncated?: boolean
  transformedBody?: string
  transformedBodyBytes?: number
  transformedBodyTruncated?: boolean
  error?: { name: string; code?: string }
}

/**
 * 仅写入显式指定的私有诊断包。不得保存异常 message、规则正文或 cause，
 * 但保留受控的底层错误码，供离线重放区分语法失败与兼容性候选。
 */
export interface SourceAuditFailureDiagnostic {
  category: SourceAuditErrorCategory | string
  status: SourceAuditStageStatus
  name: string
  rawCode?: string
  stage: SourceAuditStage
  field?: string
  compatibilityMode?: 'legado' | 'standard'
}

export interface SourceAuditDiagnosticCase {
  sourceId: string
  sourceName: string
  source: BookSource
  failedStages: Partial<SourceAuditEntry['stages']>
  /** 旧版 schemaVersion=1 诊断包可能没有此字段。新生成的诊断包始终写入。 */
  failures?: Partial<Record<SourceAuditStage, SourceAuditFailureDiagnostic>>
  debug: SourceAuditDebugContext
  requests: SourceAuditRequestDiagnostic[]
}

export interface SourceAuditDiagnosticBundle {
  schemaVersion: 1
  kind: 'source-audit-diagnostics'
  generatedAt: number
  engineVersion: number
  audit: Pick<SourceAuditRun, 'mode' | 'scope' | 'startedAt' | 'completedAt' | 'status' | 'summary'>
  cases: SourceAuditDiagnosticCase[]
}

function redactUrl(value: string): string {
  try {
    const parsed = new URL(value)
    for (const key of [...parsed.searchParams.keys()]) {
      if (SECRET_QUERY_KEY.test(key)) parsed.searchParams.set(key, '[REDACTED]')
    }
    parsed.username = ''
    parsed.password = ''
    return parsed.toString()
  } catch {
    return value.replace(/([?&](?:token|auth|key|secret|password|session|sign|signature|code)=)[^&#]*/gi, '$1[REDACTED]')
  }
}

function safeHeaders(headers: Record<string, string> | undefined, allowed: Set<string>): Record<string, string> {
  if (!headers) return {}
  return Object.fromEntries(Object.entries(headers)
    .filter(([name]) => allowed.has(name.toLowerCase()))
    .map(([name, value]) => [name, name.toLowerCase() === 'location' || name.toLowerCase() === 'referer'
      ? redactUrl(value) : value]))
}

function decodeBody(body: Uint8Array | undefined, charset?: string) {
  if (!body) return {}
  const captured = body.slice(0, MAX_CAPTURED_BODY_BYTES)
  let value: string
  try {
    value = new TextDecoder(charset || 'utf-8').decode(captured)
  } catch {
    value = new TextDecoder().decode(captured)
  }
  return {
    value,
    bytes: body.length,
    truncated: body.length > captured.length || undefined,
  }
}

function safeIdentifier(value: unknown, maxLength = 96): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().slice(0, maxLength)
  return /^[A-Za-z0-9_.:[\]-]+$/.test(normalized) ? normalized : undefined
}

export function sanitizeFailureDiagnostic(
  error: unknown,
  stage: SourceAuditStage,
  classified: { code: SourceAuditErrorCategory | string; status: SourceAuditStageStatus; field?: string },
): SourceAuditFailureDiagnostic {
  const value = error as {
    name?: unknown
    code?: unknown
    field?: unknown
    compatibilityMode?: unknown
  }
  const compatibilityMode = value?.compatibilityMode === 'legado' || value?.compatibilityMode === 'standard'
    ? value.compatibilityMode
    : undefined
  return {
    category: classified.code,
    status: classified.status,
    name: safeIdentifier(value?.name) || 'Error',
    rawCode: safeIdentifier(value?.code),
    stage,
    field: safeIdentifier(classified.field || value?.field, 160),
    compatibilityMode,
  }
}

/**
 * 保留规则与响应用于本机重放，但移除书源对象中显式的认证字段。
 * 诊断包仍可能包含站点返回的私人内容，所以只能写入显式指定的私有目录。
 */
export function redactDiagnosticSource<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redactDiagnosticSource) as T
  if (typeof value === 'string') return redactUrl(value) as T
  if (!value || typeof value !== 'object') return value
  const result: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(key)) {
      result[key] = '[REDACTED]'
    } else if (/^headers?$/i.test(key) && typeof child === 'string') {
      try {
        result[key] = JSON.stringify(redactDiagnosticSource(JSON.parse(child)))
      } catch {
        result[key] = '[REDACTED]'
      }
    } else {
      result[key] = redactDiagnosticSource(child)
    }
  }
  return result as T
}

export function sanitizeRequestTrace(trace: SourceEngineRequestTrace): SourceAuditRequestDiagnostic {
  const raw = decodeBody(trace.response?.body, trace.response?.charset)
  const transformed = trace.transformedResponse && trace.transformedResponse !== trace.response
    ? decodeBody(trace.transformedResponse.body, trace.transformedResponse.charset)
    : undefined
  const error = trace.error as { name?: unknown; code?: unknown } | undefined
  return {
    stage: (trace.stage || 'unknown') as SourceAuditStage | 'unknown',
    method: trace.request.method,
    url: redactUrl(trace.request.url),
    requestHeaders: safeHeaders(trace.request.headers, SAFE_REQUEST_HEADERS),
    requestBodyLength: trace.request.body?.length || 0,
    status: trace.response?.status,
    finalUrl: trace.response?.finalUrl ? redactUrl(trace.response.finalUrl) : undefined,
    responseHeaders: trace.response ? safeHeaders(trace.response.headers, SAFE_RESPONSE_HEADERS) : undefined,
    charset: trace.transformedResponse?.charset || trace.response?.charset,
    channel: trace.transformedResponse?.channel || trace.response?.channel,
    body: raw.value,
    bodyBytes: raw.bytes,
    bodyTruncated: raw.truncated,
    transformedBody: transformed?.value,
    transformedBodyBytes: transformed?.bytes,
    transformedBodyTruncated: transformed?.truncated,
    error: error ? { name: String(error.name || 'Error'), code: error.code ? String(error.code) : undefined } : undefined,
  }
}

export function createSourceAuditDiagnosticBundle(
  run: SourceAuditRun,
  sources: BookSource[],
  traces: Map<string, SourceAuditRequestDiagnostic[]>,
  debugContexts: Map<string, SourceAuditDebugContext>,
  failures: Map<string, Partial<Record<SourceAuditStage, SourceAuditFailureDiagnostic>>> = new Map(),
): SourceAuditDiagnosticBundle {
  const cases = run.entries.flatMap((entry, index) => {
    const source = sources[index]
    if (!source) return []
    const sourceUrl = source.bookSourceUrl
    const failedStages = Object.fromEntries(Object.entries(entry.stages)
      .filter(([, result]) => result && ['failed', 'unsupported', 'needs-action'].includes(result.status)))
    if (Object.keys(failedStages).length === 0) return []
    return [{
      sourceId: entry.sourceId,
      sourceName: entry.sourceName,
      source: redactDiagnosticSource(structuredClone(source)),
      failedStages,
      failures: structuredClone(failures.get(entry.sourceId) || {}),
      debug: redactDiagnosticSource(structuredClone(debugContexts.get(entry.sourceId) || {})),
      requests: structuredClone(traces.get(sourceUrl) || []),
    }]
  })
  return {
    schemaVersion: 1,
    kind: 'source-audit-diagnostics',
    generatedAt: Date.now(),
    engineVersion: run.engineVersion,
    audit: {
      mode: run.mode,
      scope: run.scope,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      status: run.status,
      summary: run.summary,
    },
    cases,
  }
}
