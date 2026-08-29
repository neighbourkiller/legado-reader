import type { BookSource } from '@/source/types/BookSource'
import { inspectSourceCompatibility } from '@/source/engine/Compatibility'
import type { SourceAuditEntry } from './SourceAuditTypes'

export type SourceStatusTone = 'success' | 'warning' | 'danger' | 'info'

export interface SourceStatusPresentation {
  label: string
  tone: SourceStatusTone
}

export function getRuleCompatibilityStatus(source: BookSource): SourceStatusPresentation {
  const report = inspectSourceCompatibility(source)
  if (report.status === 'supported') return { label: '规则兼容', tone: 'success' }
  if (report.status === 'partial') return { label: `部分兼容 ${report.issues.length}`, tone: 'warning' }
  return { label: `不支持 ${report.issues.length}`, tone: 'danger' }
}

export function getAuditStatus(
  audit: SourceAuditEntry | undefined,
  isCurrentEngine: boolean,
): SourceStatusPresentation | undefined {
  if (!audit) return undefined
  if (!isCurrentEngine) return { label: '批测已过期', tone: 'info' }
  if (audit.verificationStatus === 'live-passed') return { label: '实测通过', tone: 'success' }
  if (Object.values(audit.stages).some(stage => stage?.status === 'needs-action')) {
    return { label: '待登录验证', tone: 'warning' }
  }
  const failed = Object.values(audit.stages)
    .filter(stage => stage?.status === 'failed' || stage?.status === 'unsupported').length
  if (failed > 0) return { label: `实测失败 ${failed}`, tone: 'danger' }
  return undefined
}
