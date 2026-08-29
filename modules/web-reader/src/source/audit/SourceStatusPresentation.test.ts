import { describe, expect, it } from 'vitest'
import type { BookSource } from '@/source/types/BookSource'
import type { SourceAuditEntry } from './SourceAuditTypes'
import { getAuditStatus, getRuleCompatibilityStatus } from './SourceStatusPresentation'

const source = (overrides: Partial<BookSource> = {}): BookSource => ({
  bookSourceName: '测试源',
  bookSourceUrl: 'https://example.com',
  bookSourceType: 0,
  enabled: true,
  ...overrides,
})

const audit = (overrides: Partial<SourceAuditEntry> = {}): SourceAuditEntry => ({
  sourceId: 'source',
  sourceName: '测试源',
  sourceType: 0,
  capabilities: [],
  stages: {},
  verificationStatus: 'untested',
  ...overrides,
})

describe('书源状态展示', () => {
  it('静态兼容状态与问题数量保持独立语义', () => {
    expect(getRuleCompatibilityStatus(source())).toEqual({ label: '规则兼容', tone: 'success' })
    expect(getRuleCompatibilityStatus(source({ bookSourceType: 3 }))).toEqual({ label: '不支持 1', tone: 'danger' })
  })

  it('无批测历史时不显示实测状态', () => {
    expect(getAuditStatus(undefined, true)).toBeUndefined()
  })

  it('区分过期、通过、待验证与失败状态', () => {
    expect(getAuditStatus(audit(), false)?.label).toBe('批测已过期')
    expect(getAuditStatus(audit({ verificationStatus: 'live-passed' }), true)?.label).toBe('实测通过')
    expect(getAuditStatus(audit({ stages: { login: { status: 'needs-action' } } }), true)?.label).toBe('待登录验证')
    expect(getAuditStatus(audit({ stages: {
      search: { status: 'failed' },
      content: { status: 'unsupported' },
    } }), true)?.label).toBe('实测失败 2')
  })
})
