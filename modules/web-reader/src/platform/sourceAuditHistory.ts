import type { SourceAuditRun } from '@/source/audit/SourceAuditTypes'
import { platform } from './capabilities'

async function invokeAudit<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!platform.isDesktop) throw new Error('书源批测历史仅在 Tauri 桌面端可用')
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

export function loadSourceAuditHistory(): Promise<SourceAuditRun[]> {
  return invokeAudit('load_source_audit_history')
}

export function saveSourceAuditRun(run: SourceAuditRun): Promise<SourceAuditRun[]> {
  return invokeAudit('save_source_audit_run', { run })
}

export function clearSourceAuditHistory(): Promise<void> {
  return invokeAudit('clear_source_audit_history')
}
