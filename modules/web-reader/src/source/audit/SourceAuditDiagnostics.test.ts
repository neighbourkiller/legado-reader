// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { BookSource } from '@/source/types/BookSource'
import {
  createSourceAuditDiagnosticBundle,
  sanitizeRequestTrace,
} from './SourceAuditDiagnostics'
import { replaySourceAuditBundle } from './SourceAuditReplay'
import type { SourceAuditRun } from './SourceAuditTypes'

const source: BookSource = {
  bookSourceUrl: 'https://fixture.invalid',
  bookSourceName: '诊断夹具',
  bookSourceType: 0,
  enabled: true,
  header: '{"Authorization":"secret"}',
  searchUrl: '/search?token=secret&q=book',
  ruleSearch: { bookList: '.book', name: '.name@text', bookUrl: 'a@href' },
}

function failedRun(): SourceAuditRun {
  return {
    schemaVersion: 1,
    engineVersion: 2,
    mode: 'quick',
    startedAt: 1,
    completedAt: 2,
    status: 'completed',
    entries: [{
      sourceId: 'fixture-id', sourceName: source.bookSourceName, sourceType: 0,
      capabilities: ['css'], verificationStatus: 'untested',
      stages: { search: { status: 'failed', code: 'EMPTY_RESULT', field: 'ruleSearch.bookList' } },
    }],
  }
}

describe('书源失败诊断与离线重放', () => {
  it('移除请求凭据和敏感查询参数，但保留可重放响应', async () => {
    const trace = sanitizeRequestTrace({
      sourceId: source.bookSourceUrl,
      stage: 'search',
      request: {
        sourceId: source.bookSourceUrl,
        method: 'GET',
        url: 'https://fixture.invalid/search?token=secret&q=book',
        headers: { Authorization: 'Bearer secret', Cookie: 'sid=secret', Accept: 'text/html' },
      },
      response: {
        status: 200,
        finalUrl: 'https://fixture.invalid/search?token=secret&q=book',
        headers: { 'Content-Type': 'text/html', 'Set-Cookie': 'sid=secret' },
        body: new TextEncoder().encode('<div class="book"><a href="/1"><span class="name">测试书</span></a></div>'),
        charset: 'utf-8',
        channel: 'reqwest',
      },
    })
    expect(trace.url).toContain('token=%5BREDACTED%5D')
    expect(trace.requestHeaders).toEqual({ Accept: 'text/html' })
    expect(trace.responseHeaders).not.toHaveProperty('Set-Cookie')

    const bundle = createSourceAuditDiagnosticBundle(
      failedRun(), [source], new Map([[source.bookSourceUrl, [trace]]]), new Map(),
    )
    expect(bundle.cases[0].source.header).not.toContain('secret')
    expect(bundle.cases[0].source.searchUrl).not.toContain('secret')
    const replay = await replaySourceAuditBundle(bundle)
    expect(replay.results).toEqual([expect.objectContaining({
      stage: 'search', status: 'passed', count: 1,
      attribution: {
        state: 'candidate', candidateCause: 'ONLINE_PIPELINE',
        evidence: 'ONLINE_FAILED_OFFLINE_PASSED', confirmationRequired: 'LIVE_PIPELINE_INVESTIGATION',
      },
    })])
  })

  it('没有响应的失败明确标记为不可重放', async () => {
    const bundle = createSourceAuditDiagnosticBundle(failedRun(), [source], new Map(), new Map())
    delete bundle.cases[0].failures
    const replay = await replaySourceAuditBundle(bundle)
    expect(replay.results[0]).toMatchObject({
      status: 'skipped', code: 'MISSING_RESPONSE',
      attribution: { state: 'unresolved', candidateCause: 'UNKNOWN', evidence: 'MISSING_RESPONSE' },
    })
  })

  it('重放语法失败只标记规则或引擎语义候选，要求 Android 差分确认', async () => {
    const invalidSource: BookSource = {
      ...source,
      ruleSearch: { ...source.ruleSearch!, bookList: '@XPath://*[' },
    }
    const run = failedRun()
    run.entries[0].stages.search = {
      status: 'failed', code: 'RULE_SYNTAX_ERROR', field: 'ruleSearch.bookList',
    }
    const trace = sanitizeRequestTrace({
      sourceId: source.bookSourceUrl,
      stage: 'search',
      request: { sourceId: source.bookSourceUrl, method: 'GET', url: source.bookSourceUrl, headers: {} },
      response: {
        status: 200, finalUrl: source.bookSourceUrl, headers: {},
        body: new TextEncoder().encode('<div class="book">测试</div>'), charset: 'utf-8', channel: 'reqwest',
      },
    })
    const bundle = createSourceAuditDiagnosticBundle(
      run,
      [invalidSource],
      new Map([[source.bookSourceUrl, [trace]]]),
      new Map(),
      new Map([['fixture-id', { search: {
        category: 'RULE_SYNTAX_ERROR', status: 'failed', name: 'RuleExecutionError',
        rawCode: 'INVALID_XPATH', stage: 'search', field: 'ruleSearch.bookList', compatibilityMode: 'legado',
      } }]]),
    )

    const replay = await replaySourceAuditBundle(bundle)

    expect(replay.results[0]).toMatchObject({
      status: 'failed', code: 'INVALID_XPATH', originalCategory: 'RULE_SYNTAX_ERROR',
      rawCode: 'INVALID_XPATH', field: 'ruleSearch.bookList',
      attribution: {
        state: 'ready_for_differential', candidateCause: 'RULE_OR_ENGINE_SEMANTICS',
        evidence: 'OFFLINE_REPLAY_REPRODUCED', confirmationRequired: 'ANDROID_DIFFERENTIAL',
      },
    })
    expect(replay.summary.readyForDifferential).toBe(1)
  })

  it('HTTP 错误体即使能离线解析也不得进入规则或引擎候选', async () => {
    const trace = sanitizeRequestTrace({
      sourceId: source.bookSourceUrl,
      stage: 'search',
      request: { sourceId: source.bookSourceUrl, method: 'GET', url: source.bookSourceUrl, headers: {} },
      response: {
        status: 403, finalUrl: source.bookSourceUrl, headers: { 'Content-Type': 'text/html' },
        body: new TextEncoder().encode('<div class="book"><span class="name">测试书</span></div>'),
        charset: 'utf-8', channel: 'reqwest',
      },
    })
    const bundle = createSourceAuditDiagnosticBundle(
      failedRun(), [source], new Map([[source.bookSourceUrl, [trace]]]), new Map(),
      new Map([['fixture-id', { search: {
        category: 'HTTP_ERROR', status: 'failed', name: 'SourceHttpError',
        rawCode: 'HTTP_ERROR', stage: 'search', field: 'ruleSearch.bookList',
      } }]]),
    )

    const replay = await replaySourceAuditBundle(bundle)

    expect(replay.results[0]).toMatchObject({
      responseEligibility: { kind: 'http-error', replayEligible: false },
      attribution: {
        state: 'ineligible_response', candidateCause: 'NETWORK_OR_SITE',
        evidence: 'NON_SUCCESS_HTTP_RESPONSE',
      },
    })
    expect(replay.summary.readyForDifferential).toBe(0)
  })

  it('空结果没有已知目标数据时阻止进入 Android 差分队列', async () => {
    const trace = sanitizeRequestTrace({
      sourceId: source.bookSourceUrl,
      stage: 'search',
      request: { sourceId: source.bookSourceUrl, method: 'GET', url: source.bookSourceUrl, headers: {} },
      response: {
        status: 200, finalUrl: source.bookSourceUrl, headers: { 'Content-Type': 'text/html' },
        body: new TextEncoder().encode('<html><main><p>普通页面但没有目标书目</p></main></html>'),
        charset: 'utf-8', channel: 'reqwest',
      },
    })
    const bundle = createSourceAuditDiagnosticBundle(
      failedRun(), [source], new Map([[source.bookSourceUrl, [trace]]]), new Map(),
    )

    const replay = await replaySourceAuditBundle(bundle)

    expect(replay.results[0]).toMatchObject({
      responseEligibility: { kind: 'clean-response', targetDataEvidence: false },
      attribution: { state: 'blocked_missing_target_data', evidence: 'TARGET_DATA_NOT_ESTABLISHED' },
    })
  })
})
