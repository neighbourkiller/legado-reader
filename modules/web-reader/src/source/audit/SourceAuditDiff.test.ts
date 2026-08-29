import { describe, expect, it } from 'vitest'
import type { SourceAuditRun } from './SourceAuditTypes'
import { compareSourceAuditRuns } from './SourceAuditDiff'

function run(searchStatus: 'passed' | 'failed', startedAt: number): SourceAuditRun {
  return {
    schemaVersion: 1, engineVersion: 2, mode: 'quick', startedAt, completedAt: startedAt + 1, status: 'completed',
    entries: [{
      sourceId: 'one', sourceName: '测试源', sourceType: 0, capabilities: [], verificationStatus: 'untested',
      stages: { static: { status: 'passed' }, search: { status: searchStatus } },
    }],
  }
}

describe('批测历史差异', () => {
  it('识别新增失败、修复与阶段状态变化', () => {
    const failure = compareSourceAuditRuns(run('failed', 2), run('passed', 1))
    expect(failure).toContainEqual(expect.objectContaining({ kind: 'new-failure', sourceId: 'one' }))
    expect(failure).toContainEqual(expect.objectContaining({ kind: 'changed', stage: 'search', from: 'passed', to: 'failed' }))

    const fixed = compareSourceAuditRuns(run('passed', 3), run('failed', 2))
    expect(fixed).toContainEqual(expect.objectContaining({ kind: 'fixed', sourceId: 'one' }))
  })
})
