import auditContract from '../../../../../testdata/source-compat/audit-contract.json'

export const SOURCE_AUDIT_SCHEMA_VERSION = auditContract.schemaVersion as 1
export const SOURCE_ENGINE_VERSION = auditContract.engineVersion

export type SourceAuditMode = 'quick' | 'full'

export type SourceAuditStage =
  | 'static' | 'login' | 'search' | 'explore'
  | 'bookInfo' | 'toc' | 'content' | 'image'

export type SourceAuditStageStatus =
  | 'untested' | 'running' | 'passed' | 'failed'
  | 'unsupported' | 'needs-action' | 'skipped'

export interface SourceAuditStageResult {
  status: SourceAuditStageStatus
  code?: string
  field?: string
  durationMs?: number
  channel?: 'reqwest' | 'webview'
  count?: number
}

export interface SourceAuditEntry {
  sourceId: string
  sourceName: string
  sourceType: number | null
  capabilities: string[]
  stages: Partial<Record<SourceAuditStage, SourceAuditStageResult>>
  verificationStatus: 'untested' | 'fixture-passed' | 'live-passed'
}

export interface SourceAuditRun {
  schemaVersion: 1
  engineVersion: number
  mode: SourceAuditMode
  scope?: 'all' | 'enabled' | 'text' | 'image'
  startedAt: number
  completedAt?: number
  status: 'running' | 'completed' | 'cancelled'
  entries: SourceAuditEntry[]
  summary?: SourceAuditRunSummary
}

export interface SourceAuditRunSummary {
  sourceCount: number
  verificationStatus: Record<string, number>
  stageStatus: Record<string, Record<string, number>>
  errorCodes: Record<string, number>
}

export type SourceAuditErrorCategory =
  | 'NETWORK_ERROR'
  | 'HTTP_ERROR'
  | 'DNS_ERROR'
  | 'TIMEOUT'
  | 'SECURITY_CHALLENGE'
  | 'EMPTY_RESULT'
  | 'RULE_SYNTAX_ERROR'
  | 'JS_EXECUTION_ERROR'
  | 'WEBVIEW_ERROR'
  | 'NEEDS_LOGIN'
  | 'UNSUPPORTED_ANDROID_API'
  | 'UNKNOWN_ERROR'

export const SOURCE_AUDIT_STAGES: SourceAuditStage[] = [
  'static', 'login', 'search', 'explore', 'bookInfo', 'toc', 'content', 'image',
]

/** 只用于当前会话的单源调试跳转，绝不能写入历史文件。 */
export interface SourceAuditDebugContext {
  keyword?: string
  exploreName?: string
  exploreUrl?: string
  bookUrl?: string
  tocUrl?: string
  chapterUrl?: string
  book?: Record<string, unknown>
  chapter?: Record<string, unknown>
}
