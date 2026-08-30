// @vitest-environment jsdom
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { evaluateRuleList, evaluateRuleString } from '@/source/engine/RuleEvaluator'

interface CandidateFixture {
  kind: 'source-audit-rule-differential-fixture'
  execution: 'string' | 'elements'
  input: { content: string; rule: string }
}

const fixturePath = process.env.LEGADO_SOURCE_CANDIDATE_FIXTURE
const outputPath = process.env.LEGADO_SOURCE_CANDIDATE_OUTPUT

describe.runIf(Boolean(fixturePath && outputPath))('候选规则 Tauri 实际结果', () => {
  it('在 Legado 兼容模式执行同一最小输入', () => {
    const fixture = JSON.parse(readFileSync(fixturePath!, 'utf8')) as CandidateFixture
    expect(fixture.kind).toBe('source-audit-rule-differential-fixture')
    const fixtureHash = createHash('sha256')
      .update(fixture.input.content).update('\0').update(fixture.input.rule).digest('hex')
    try {
      const actual = fixture.execution === 'elements'
        ? evaluateRuleList(fixture.input.content, fixture.input.rule, { compatibilityMode: 'legado' })
          .map(value => evaluateRuleString(value as Element, '@text'))
        : (() => {
            const value = evaluateRuleString(
              fixture.input.content, fixture.input.rule, { compatibilityMode: 'legado' },
            )
            return value ? [value] : []
          })()
      writeFileSync(outputPath!, JSON.stringify({
        runtime: 'tauri', status: 'completed', fixtureHash, actual,
      }))
    } catch (error) {
      writeFileSync(outputPath!, JSON.stringify({
        runtime: 'tauri', status: 'failed', fixtureHash, actual: [],
        code: String((error as { code?: unknown })?.code || 'TAURI_RULE_ERROR'),
      }))
    }
    expect(readFileSync(outputPath!, 'utf8')).toContain(fixtureHash)
  })
})
