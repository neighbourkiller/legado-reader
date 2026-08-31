import type { SourceAuditDiagnosticBundle } from './SourceAuditDiagnostics'
import type { SourceAuditReplayReport } from './SourceAuditReplay'
import type { SourceAuditMode, SourceAuditRun } from './SourceAuditTypes'

export interface SourceAuditCliOptions {
  outputPath: string
  dbPath?: string
  diagnosticsDir?: string
  replayPath?: string
  mode: SourceAuditMode
  concurrency: number
  scope: 'all' | 'enabled' | 'text' | 'image'
}

export interface SourceAuditCliBridge {
  getOptions(): Promise<SourceAuditCliOptions | null>
  markStarted(): Promise<void>
  fail(message: string): Promise<void>
  exit(code: number): Promise<void>
  loadReplayBundle(): Promise<SourceAuditDiagnosticBundle>
  completeReplay(result: SourceAuditReplayReport): Promise<void>
  loadSources(): Promise<Record<string, unknown>[]>
  complete(run: SourceAuditRun, diagnostics?: SourceAuditDiagnosticBundle): Promise<void>
}
