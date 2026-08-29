import type { SourceAuditRun, SourceAuditStage, SourceAuditStageStatus } from './SourceAuditTypes'

export interface SourceAuditChange {
  sourceId: string
  sourceName: string
  stage?: SourceAuditStage
  from?: SourceAuditStageStatus
  to?: SourceAuditStageStatus
  kind: 'new-failure' | 'fixed' | 'changed'
}

const FAILURE_STATUSES: SourceAuditStageStatus[] = ['failed', 'unsupported', 'needs-action']

function isFailure(status?: SourceAuditStageStatus) {
  return Boolean(status && FAILURE_STATUSES.includes(status))
}

function entryFailed(run: SourceAuditRun, sourceId: string) {
  const entry = run.entries.find(item => item.sourceId === sourceId)
  return Boolean(entry && Object.values(entry.stages).some(result => isFailure(result?.status)))
}

export function compareSourceAuditRuns(current: SourceAuditRun, previous?: SourceAuditRun): SourceAuditChange[] {
  if (!previous) return []
  const previousById = new Map(previous.entries.map(entry => [entry.sourceId, entry]))
  const currentById = new Map(current.entries.map(entry => [entry.sourceId, entry]))
  const changes: SourceAuditChange[] = []

  for (const entry of current.entries) {
    const wasFailed = entryFailed(previous, entry.sourceId)
    const nowFailed = entryFailed(current, entry.sourceId)
    if (!wasFailed && nowFailed) {
      changes.push({ sourceId: entry.sourceId, sourceName: entry.sourceName, kind: 'new-failure' })
    } else if (wasFailed && !nowFailed) {
      changes.push({ sourceId: entry.sourceId, sourceName: entry.sourceName, kind: 'fixed' })
    }

    const before = previousById.get(entry.sourceId)
    if (!before) continue
    const stageNames = new Set([
      ...Object.keys(before.stages), ...Object.keys(entry.stages),
    ] as SourceAuditStage[])
    for (const stage of stageNames) {
      const from = before.stages[stage]?.status
      const to = entry.stages[stage]?.status
      if (from && to && from !== to) {
        changes.push({ sourceId: entry.sourceId, sourceName: entry.sourceName, stage, from, to, kind: 'changed' })
      }
    }
  }

  for (const entry of previous.entries) {
    if (!currentById.has(entry.sourceId) && entryFailed(previous, entry.sourceId)) {
      changes.push({ sourceId: entry.sourceId, sourceName: entry.sourceName, kind: 'fixed' })
    }
  }
  return changes
}
