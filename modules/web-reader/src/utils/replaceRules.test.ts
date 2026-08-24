// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { ReplaceRuleRecord } from '@/storage/db'
import {
  applicableReplaceRules,
  applyReplacementRulesToSegments,
  applyRulesToChapter,
  applyRulesToSourceJson,
  ReplacementTimeoutError,
} from './replaceRules'

const rule = (overrides: Partial<ReplaceRuleRecord> = {}): ReplaceRuleRecord => ({
  id: 1,
  name: '测试',
  group: '',
  pattern: '旧',
  replacement: '新',
  scope: '',
  scopeTitle: false,
  scopeSource: false,
  scopeContent: true,
  excludeScope: '',
  isEnabled: true,
  isRegex: false,
  timeoutMillisecond: 3000,
  order: 1,
  ...overrides,
})

describe('替换规则执行', () => {
  it('按排序执行字面量与正则规则', async () => {
    const result = await applyReplacementRulesToSegments(['旧内容 123'], [
      rule({ id: 2, pattern: '\\d+', replacement: '数字', isRegex: true, order: 2 }),
      rule({ id: 1, order: 1 }),
    ])
    expect(result.segments).toEqual(['新内容 数字'])
    expect(result.effectiveRuleIds).toEqual([1, 2])
  })

  it('匹配书名/书源包含范围和排除范围', () => {
    const rules = [
      rule({ scope: '测试书;https://source.example', scopeTitle: true }),
      rule({ id: 2, excludeScope: '测试书' }),
    ]
    expect(applicableReplaceRules(rules, {
      bookName: '测试书',
      sourceUrl: 'https://source.example',
    }, 'content').map(item => item.id)).toEqual([1])
  })

  it('标题和正文即时处理，EPUB 只替换文本节点', async () => {
    const rules = [rule({ scopeTitle: true })]
    const payload = await applyRulesToChapter({
      index: 0,
      title: '旧标题',
      content: '<p>旧<a href="/旧">旧链接</a></p>',
      format: 'epub',
    }, rules, { bookName: '书' })
    expect(payload.title).toBe('新标题')
    expect(payload.content).toContain('href="/旧"')
    expect(payload.content).toContain('新链接')
  })

  it('书源替换后重新校验 JSON，禁止写入无效结果', async () => {
    await expect(applyRulesToSourceJson(
      { bookSourceName: '测试', bookSourceUrl: 'https://example.com' },
      [rule({ scopeContent: false, scopeSource: true, pattern: '"', replacement: '' })],
    )).rejects.toThrow()
  })

  it('无效正则明确失败，Worker 超时会终止并携带问题规则', async () => {
    await expect(applyReplacementRulesToSegments(
      ['正文'],
      [rule({ isRegex: true, pattern: '[', timeoutMillisecond: 100 })],
    )).rejects.toThrow()

    const originalWorker = globalThis.Worker
    const originalCreateObjectUrl = URL.createObjectURL
    const originalRevokeObjectUrl = URL.revokeObjectURL
    class IdleWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null
      postMessage() {}
      terminate() {}
    }
    Object.defineProperty(globalThis, 'Worker', { value: IdleWorker, configurable: true })
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:test', configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true })
    try {
      await expect(applyReplacementRulesToSegments(
        ['正文'],
        [rule({ isRegex: true, pattern: '正文', timeoutMillisecond: 100 })],
      )).rejects.toBeInstanceOf(ReplacementTimeoutError)
    } finally {
      Object.defineProperty(globalThis, 'Worker', { value: originalWorker, configurable: true })
      Object.defineProperty(URL, 'createObjectURL', { value: originalCreateObjectUrl, configurable: true })
      Object.defineProperty(URL, 'revokeObjectURL', { value: originalRevokeObjectUrl, configurable: true })
    }
  })
})
