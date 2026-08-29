import sharedFixtures from '../../../../../testdata/source-compat/rule-fixtures.json'
import quickJsFixtures from '../../../../../testdata/source-compat/quickjs-host-fixtures.json'
import { evaluateRuleList, evaluateRuleString } from '@/source/engine/RuleEvaluator'
import { executeSourceJavaScript } from '@/platform/sourceScripts'
import { classifySourceAuditError } from './SourceAuditRunner'

export type SourceFixtureExecution = 'string' | 'elements' | 'quickjs'

export interface SourceCompatFixture {
  id: string
  html: string
  rule: string
  androidExpected: string[]
  standardExpected?: string[]
  /** 兼容旧夹具 mode 字段，新夹具优先使用 execution。 */
  mode?: 'string'
  execution?: SourceFixtureExecution
  capability?: string
}

export interface SourceFixtureResult {
  id: string
  capability: string
  execution: SourceFixtureExecution
  androidExpected: string[]
  tauriActual: string[]
  passed: boolean
  code?: string
}

interface QuickJsHostFixture {
  id: string
  code: string
  bindings: { result?: unknown; variables?: Record<string, string> }
  androidExpected: string[]
  capability: string
}

function inferCapability(fixture: SourceCompatFixture): string {
  if (fixture.capability) return fixture.capability
  if (/@?xpath:|(?:^|\s)\/\//i.test(fixture.rule)) return 'xpath'
  if (/@?json:/i.test(fixture.rule)) return 'jsonpath'
  if (/##|@?regex:/i.test(fixture.rule)) return 'regex'
  if (/@js:|<js>|\{\{/.test(fixture.rule)) return 'javascript'
  if (/@(?:textNodes|ownText|html|all)/i.test(fixture.rule)) return 'text'
  return 'css'
}

export function getSharedSourceFixtures(): SourceCompatFixture[] {
  return sharedFixtures as SourceCompatFixture[]
}

export function runSourceFixture(fixture: SourceCompatFixture): SourceFixtureResult {
  const execution = fixture.execution || (fixture.mode === 'string' ? 'string' : 'elements')
  try {
    const actual = execution === 'string'
      ? (() => {
          const value = evaluateRuleString(fixture.html, fixture.rule, { compatibilityMode: 'legado' })
          return value ? [value] : []
        })()
      : evaluateRuleList(fixture.html, fixture.rule, { compatibilityMode: 'legado' })
        .map(value => evaluateRuleString(value as Element, '@text'))
    return {
      id: fixture.id,
      capability: inferCapability(fixture),
      execution,
      androidExpected: fixture.androidExpected,
      tauriActual: actual,
      passed: JSON.stringify(actual) === JSON.stringify(fixture.androidExpected),
    }
  } catch (error) {
    return {
      id: fixture.id,
      capability: inferCapability(fixture),
      execution,
      androidExpected: fixture.androidExpected,
      tauriActual: [],
      passed: false,
      code: classifySourceAuditError(error).code,
    }
  }
}

export function runSharedSourceFixtures(): SourceFixtureResult[] {
  return getSharedSourceFixtures().map(runSourceFixture)
}

/** 仅在真实 Tauri 运行时调用，确保 UI 走 Rust QuickJS 而不是浏览器替身。 */
export async function runSharedQuickJsFixtures(): Promise<SourceFixtureResult[]> {
  return Promise.all((quickJsFixtures as QuickJsHostFixture[]).map(async fixture => {
    try {
      const context = {
        compatibilityMode: 'legado' as const,
        stage: 'unknown' as const,
        variables: new Map(Object.entries(fixture.bindings.variables || {})),
      }
      const response = await executeSourceJavaScript(
        `source-compat-fixture:${fixture.id}`,
        fixture.code,
        context,
        fixture.bindings.result,
      )
      const actual = response.result == null ? [] : [String(response.result)]
      return {
        id: fixture.id,
        capability: fixture.capability,
        execution: 'quickjs' as const,
        androidExpected: fixture.androidExpected,
        tauriActual: actual,
        passed: JSON.stringify(actual) === JSON.stringify(fixture.androidExpected),
      }
    } catch (error) {
      return {
        id: fixture.id,
        capability: fixture.capability,
        execution: 'quickjs' as const,
        androidExpected: fixture.androidExpected,
        tauriActual: [],
        passed: false,
        code: classifySourceAuditError(error).code,
      }
    }
  }))
}
