// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { BookSource, OnlineChapterPayload, SearchResult } from '@/source/types/BookSource'
import type { BookInfo } from '@/source/engine/BookInfoParser'
import type { TocItem } from '@/source/engine/TocParser'
import { RuleExecutionError } from '@/source/engine/RuleTypes'
import {
  SourceAuditRunner,
  classifySourceAuditError,
  type SourceAuditEngine,
} from './SourceAuditRunner'

const source: BookSource = {
  bookSourceUrl: 'https://audit.example',
  bookSourceName: '批测源',
  bookSourceType: 0,
  enabled: false,
  searchUrl: '/search',
  ruleSearch: { checkKeyWord: '夹具关键词', bookList: '.book', name: 'text', bookUrl: 'href' },
  ruleBookInfo: { name: 'h1', tocUrl: '.toc@href' },
  ruleToc: { chapterList: 'a', chapterName: 'text', chapterUrl: 'href' },
  ruleContent: { content: '.content' },
}

function successfulEngine(overrides: Partial<SourceAuditEngine> = {}) {
  const searchResult: SearchResult = {
    name: '书名', author: '作者', bookUrl: 'https://audit.example/book', variableMap: { search: '1' },
  }
  const bookInfo: BookInfo = {
    name: '书名', author: '作者', coverUrl: '', intro: '', tocUrl: 'https://audit.example/toc',
    variableMap: { detail: '2' },
  }
  const chapter: TocItem = {
    name: '第一章', url: 'https://audit.example/chapter', variableMap: { chapter: '3' },
  }
  const payload: OnlineChapterPayload = { type: 'text', text: '正文' }
  return {
    search: vi.fn(async () => [searchResult]),
    explore: vi.fn(async () => [searchResult]),
    getBookInfo: vi.fn(async () => bookInfo),
    getToc: vi.fn(async () => [chapter]),
    getContent: vi.fn(async () => payload),
    checkLogin: vi.fn(async () => ({ checked: false, loggedIn: false })),
    fetchSourceAsset: vi.fn(async () => ({ body: new Uint8Array([1]), mime: 'image/png' })),
    ...overrides,
  } satisfies SourceAuditEngine
}

describe('SourceAuditRunner', () => {
  it('快速模式完成搜索、详情、一页目录和正文，并保留完整实体', async () => {
    const engine = successfulEngine()
    const runner = new SourceAuditRunner({
      mode: 'quick', engineFactory: () => engine, idFactory: async () => 'source-id',
    })

    const run = await runner.run([source])

    expect(run.status).toBe('completed')
    expect(run.summary).toMatchObject({
      sourceCount: 1,
      verificationStatus: { 'live-passed': 1 },
    })
    expect(run.entries[0].verificationStatus).toBe('live-passed')
    expect(run.entries[0].stages.content).toMatchObject({ status: 'passed', count: 1 })
    expect(engine.search).toHaveBeenCalledWith(source, '夹具关键词', expect.any(Function))
    expect(engine.getToc).toHaveBeenCalledWith(
      source,
      expect.objectContaining({ bookUrl: 'https://audit.example/book', variableMap: { search: '1', detail: '2' } }),
      undefined,
      { maxPages: 1 },
    )
    expect(engine.getContent).toHaveBeenCalledWith(
      source,
      expect.objectContaining({ variableMap: { chapter: '3' } }),
      undefined,
      expect.objectContaining({ variableMap: { search: '1', detail: '2' } }),
    )
  })

  it('搜索空结果会跳过依赖阶段但保留后续书源', async () => {
    const empty = successfulEngine({ search: vi.fn(async () => []) })
    const success = successfulEngine()
    let created = 0
    const runner = new SourceAuditRunner({
      mode: 'quick',
      engineFactory: () => created++ === 0 ? empty : success,
      idFactory: async value => value,
    })
    const second = { ...source, bookSourceUrl: 'https://audit-2.example', bookSourceName: '第二源' }

    const run = await runner.run([source, second])

    expect(run.entries[0].stages.search).toMatchObject({ status: 'failed', code: 'EMPTY_RESULT' })
    expect(run.entries[0].stages.bookInfo).toMatchObject({ status: 'skipped', code: 'DEPENDENCY_SEARCH' })
    expect(run.entries[1].verificationStatus).toBe('live-passed')
  })

  it('完整模式检查登录并将未登录标为待处理', async () => {
    const engine = successfulEngine({
      checkLogin: vi.fn(async () => ({ checked: true, loggedIn: false })),
    })
    const runner = new SourceAuditRunner({
      mode: 'full', engineFactory: () => engine, idFactory: async () => 'source-id',
    })
    const loginSource = { ...source, loginCheckJs: 'return false', loginUrl: '/login' }

    const run = await runner.run([loginSource])

    expect(run.entries[0].stages.login).toMatchObject({ status: 'needs-action', code: 'NEEDS_LOGIN' })
    expect(run.entries[0].stages.search).toMatchObject({ status: 'skipped', code: 'DEPENDENCY_NEEDS_LOGIN' })
  })

  it('完整图片源抽样首中末正文并验证首图下载与解密结果', async () => {
    const chapters = Array.from({ length: 5 }, (_, index) => ({
      name: `第${index + 1}章`, url: `https://audit.example/${index + 1}`,
    }))
    const engine = successfulEngine({
      getToc: vi.fn(async () => chapters),
      getContent: vi.fn(async (_source, chapter) => ({
        type: 'images' as const, sourceUrl: chapter.url, images: [{ url: `${chapter.url}.jpg`, index: 0 }],
      })),
    })
    const runner = new SourceAuditRunner({
      mode: 'full', engineFactory: () => engine, idFactory: async () => 'image',
    })

    const run = await runner.run([{ ...source, bookSourceType: 2 }])

    expect(engine.getContent).toHaveBeenCalledTimes(3)
    expect(engine.getContent).toHaveBeenNthCalledWith(1, expect.anything(), expect.objectContaining({ url: chapters[0].url }), undefined, expect.anything())
    expect(engine.getContent).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({ url: chapters[2].url }), undefined, expect.anything())
    expect(engine.getContent).toHaveBeenNthCalledWith(3, expect.anything(), expect.objectContaining({ url: chapters[4].url }), undefined, expect.anything())
    expect(engine.fetchSourceAsset).toHaveBeenCalledWith(expect.anything(), `${chapters[0].url}.jpg`, chapters[0].url)
    expect(run.entries[0].stages.image?.status).toBe('passed')
    expect(run.entries[0].verificationStatus).toBe('live-passed')
  })

  it('非文本和图片源只执行静态分类', async () => {
    const runner = new SourceAuditRunner({
      mode: 'quick', engineFactory: successfulEngine, idFactory: async () => 'audio',
    })
    const run = await runner.run([{ ...source, bookSourceType: 1 }])
    expect(run.entries[0].stages.static).toMatchObject({ status: 'unsupported', code: 'UNSUPPORTED_SOURCE_TYPE' })
    expect(run.entries[0].stages.search?.status).toBe('skipped')
  })

  it('停止后不启动排队源', async () => {
    let releaseSearch: ((value: SearchResult[]) => void) | undefined
    const engine = successfulEngine({
      search: vi.fn(() => new Promise<SearchResult[]>(resolve => { releaseSearch = resolve })),
    })
    const runner = new SourceAuditRunner({
      mode: 'quick', engineFactory: () => engine, idFactory: async value => value, concurrency: 1,
    })
    const promise = runner.run([source, { ...source, bookSourceUrl: 'second' }])
    await vi.waitFor(() => expect(engine.search).toHaveBeenCalledTimes(1))
    runner.stop()
    releaseSearch?.([{ name: '书名', author: '', bookUrl: '/book' }])
    const run = await promise
    expect(run.status).toBe('cancelled')
    expect(engine.search).toHaveBeenCalledTimes(1)
    expect(run.entries[1].stages.search).toMatchObject({ status: 'skipped', code: 'CANCELLED' })
  })
})

describe('批测错误归一化', () => {
  it('不持久化规则正文，仅返回分类和字段', () => {
    const classified = classifySourceAuditError(new RuleExecutionError('secret', {
      code: 'INVALID_XPATH', stage: 'search', field: 'ruleSearch.name', rule: '//secret', mode: 'legado',
    }))
    expect(classified).toEqual({ code: 'RULE_SYNTAX_ERROR', field: 'ruleSearch.name', status: 'failed' })
    expect(classified).not.toHaveProperty('message')
    expect(classified).not.toHaveProperty('rule')
  })

  it('区分 HTTP 未登录、WebView 和普通规则错误', () => {
    expect(classifySourceAuditError(Object.assign(new Error('unauthorized'), { code: 'HTTP_ERROR', status: 401 })))
      .toEqual({ code: 'NEEDS_LOGIN', status: 'needs-action' })
    expect(classifySourceAuditError(new RuleExecutionError('webview', {
      code: 'WEBJS_EXECUTION_FAILED', rule: '<webjs>', mode: 'legado',
    }))).toEqual({ code: 'WEBVIEW_ERROR', field: undefined, status: 'failed' })
  })

  it('普通报告只保留归一化分类，私有诊断包保留受控底层错误码', async () => {
    const engine = successfulEngine({
      search: vi.fn(async () => {
        throw new RuleExecutionError('包含敏感规则的错误消息', {
          code: 'INVALID_XPATH', stage: 'search', field: 'ruleSearch.bookList',
          rule: '@XPath://secret[', mode: 'legado',
        })
      }),
    })
    const runner = new SourceAuditRunner({
      mode: 'quick', captureDiagnostics: true, engineFactory: () => engine, idFactory: async () => 'source-id',
    })

    const run = await runner.run([source])
    const bundle = runner.createDiagnosticBundle(run, [source])

    expect(run.entries[0].stages.search).toEqual(expect.objectContaining({
      status: 'failed', code: 'RULE_SYNTAX_ERROR', field: 'ruleSearch.bookList',
    }))
    expect(run.entries[0].stages.search).not.toHaveProperty('rawCode')
    expect(bundle.cases[0].failures?.search).toEqual({
      category: 'RULE_SYNTAX_ERROR',
      status: 'failed',
      name: 'RuleExecutionError',
      rawCode: 'INVALID_XPATH',
      stage: 'search',
      field: 'ruleSearch.bookList',
      compatibilityMode: 'legado',
    })
    expect(JSON.stringify(bundle.cases[0].failures)).not.toContain('secret')
  })
})
