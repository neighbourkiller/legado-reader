// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { SourceEngine, type SourceEngineRequestTrace } from './SourceEngine'
import type { SourceStageDiagnostic } from './SourceDiagnostics'
import type { BookSource } from '@/source/types/BookSource'
import type { SourceResponse } from '@/source/transport/SourceTransport'

const source: BookSource = {
  bookSourceUrl: 'https://twkan.com', bookSourceName: 'TWKan fixture', bookSourceType: 0, enabled: true,
  searchUrl: '/search/{{key}}', ruleSearch: { bookList: 'li', name: 'h3@text', bookUrl: 'h3 a.0@href', coverUrl: 'img@src' },
  ruleBookInfo: { name: 'h1@text', coverUrl: 'img@src', tocUrl: 'a@href' },
  ruleToc: { chapterList: 'a', chapterName: 'text', chapterUrl: 'href' },
  ruleContent: { content: 'p@text', replaceRegex: '##广告##' },
}
const response = (body: string, status = 200): SourceResponse => ({ status, body: new TextEncoder().encode(body), headers: {}, finalUrl: 'https://twkan.com/page', channel: 'reqwest' })

describe('引擎诊断与行为隔离', () => {
  it('四阶段完整返回字段，HTTP 诊断不改变执行结果', async () => {
    const pages = ['<li><h3><a href="/book/1.html">书名</a></h3><img src="/cover.jpg"></li>', '<h1>书名</h1><img src="/cover.jpg"><a href="/toc">目录</a>', '<a href="/1">第一章</a><a href="/1">第一章</a><a href="/2"></a>', '<p>广告正文</p>']
    const run = async (enabled: boolean) => {
      const traces: SourceEngineRequestTrace[] = [], stats: SourceStageDiagnostic[] = []
      let index = 0
      const engine = new SourceEngine({ persistSourceVariables: false, transport: { request: async () => response(pages[index++]!) },
        onRequestTrace: enabled ? e => traces.push(e) : undefined, onStageDiagnostic: enabled ? e => stats.push(e) : undefined })
      const search = await engine.search(source, '租借男友')
      const info = await engine.getBookInfo(source, search[0]!.bookUrl)
      const toc = await engine.getToc(source, info.tocUrl)
      const content = await engine.getContent(source, toc[0]!.url)
      return { results: { search, info, toc, content }, traces, stats }
    }
    const observed = await run(true)
    expect(observed.results).toEqual((await run(false)).results)
    expect(observed.results.search[0]?.coverUrl).toBe('https://twkan.com/cover.jpg')
    expect(observed.traces.map(e => e.stage)).toEqual(['search', 'bookInfo', 'toc', 'content'])
    expect(observed.stats[0]).toMatchObject({ parsed: 3, filtered: 1, deduplicated: 1, finalCount: 1, reason: 'no-rule' })
    expect(observed.stats[1]).toMatchObject({ beforeReplace: 4, afterReplace: 2, pages: 1 })
  })
  it('记录重试次数，观察者抛错不传播', async () => {
    const request = vi.fn().mockResolvedValueOnce(response('retry', 500)).mockResolvedValue(response('<h1>书</h1>'))
    const trace = vi.fn((_event: SourceEngineRequestTrace) => { throw new Error('observer') })
    await expect(new SourceEngine({ persistSourceVariables: false, transport: { request }, onRequestTrace: trace }).getBookInfo(source, 'https://twkan.com/book/1')).resolves.toMatchObject({ name: '书' })
    expect(trace).toHaveBeenCalledTimes(1)
    expect(trace.mock.calls[0]?.[0]).toMatchObject({ attempts: 2, channel: 'reqwest' })
  })
  it('质询提前失败仍记录响应和错误；传输失败不伪造响应', async () => {
    const trace = vi.fn()
    const engine = new SourceEngine({ persistSourceVariables: false, transport: { request: async () => response('<title>Just a moment...</title><div>cf-chl-platform</div>', 403) }, onRequestTrace: trace })
    await expect(engine.getBookInfo(source, 'https://twkan.com/1')).rejects.toThrow()
    expect(trace).toHaveBeenCalledTimes(1)
    expect(trace.mock.calls[0]?.[0]).toMatchObject({ response: { status: 403 }, error: expect.any(Error) })
    trace.mockClear()
    const broken = new SourceEngine({ transport: { request: async () => { throw new Error('network') } }, onRequestTrace: trace })
    await expect(broken.getBookInfo(source, 'https://twkan.com/1')).rejects.toThrow('network')
    expect(trace.mock.calls[0]?.[0]).toMatchObject({ attempts: 3 })
    expect(trace.mock.calls[0]?.[0].response).toBeUndefined()
  })
  it('目录重复请求、分页上限、空下一页和失败均有结束原因', async () => {
    const stats = vi.fn()
    const engine = new SourceEngine({ persistSourceVariables: false, transport: { request: async () => response('<a href="https://twkan.com/page">下一页</a>') }, onStageDiagnostic: stats })
    const paged = { ...source, ruleToc: { ...source.ruleToc, nextTocUrl: 'a@href' } }
    await engine.getToc(paged, 'https://twkan.com/page')
    expect(stats.mock.calls[stats.mock.calls.length - 1]?.[0].reason).toBe('repeat')
    await engine.getToc(paged, 'https://twkan.com/page', undefined, { maxPages: 1 })
    expect(stats.mock.calls[stats.mock.calls.length - 1]?.[0].reason).toBe('limit')
    await engine.getToc({ ...paged, ruleToc: { ...paged.ruleToc, nextTocUrl: '.missing@href' } }, 'https://twkan.com/page')
    expect(stats.mock.calls[stats.mock.calls.length - 1]?.[0].reason).toBe('no-next')
    await expect(engine.getToc({ ...source, ruleToc: undefined }, 'https://twkan.com/page')).rejects.toThrow()
    expect(stats.mock.calls[stats.mock.calls.length - 1]?.[0].reason).toBe('error')
  })
  it('正文分页结束统计包含重复、无下一页及100页上限', async () => {
    const stats = vi.fn()
    let counter = 0
    let mode = 'repeat'
    const engine = new SourceEngine({ persistSourceVariables: false, onStageDiagnostic: stats,
      transport: { request: async () => response(`<p>正文</p>${mode === 'empty' ? '' : `<a class="next" href="https://twkan.com/${mode === 'repeat' ? 'page' : ++counter}">下一页</a>`}`) } })
    const paged = { ...source, ruleContent: { ...source.ruleContent, nextContentUrl: '.next@href' } }
    await engine.getContent(paged, 'https://twkan.com/page')
    expect(stats.mock.calls[stats.mock.calls.length - 1]?.[0]).toMatchObject({ reason: 'repeat', pages: 1 })
    mode = 'empty'
    await engine.getContent(paged, 'https://twkan.com/page')
    expect(stats.mock.calls[stats.mock.calls.length - 1]?.[0].reason).toBe('no-next')
    mode = 'limit'
    await engine.getContent(paged, 'https://twkan.com/page')
    expect(stats.mock.calls[stats.mock.calls.length - 1]?.[0]).toMatchObject({ reason: 'limit', pages: 100 })
  })
  it('WebView 请求诊断使用实际通道，阶段观察者异常不影响结果', async () => {
    const trace = vi.fn()
    const engine = new SourceEngine({ persistSourceVariables: false,
      transport: { request: vi.fn(), webviewFetch: async () => ({ ...response('<p>正文</p>'), channel: undefined }) },
      onRequestTrace: trace, onStageDiagnostic: () => { throw new Error('observer') } })
    await expect(engine.getContent({ ...source, useWebView: true }, 'https://twkan.com/page')).resolves.toMatchObject({ text: '正文' })
    expect(trace.mock.calls[0]?.[0]).toMatchObject({ channel: 'webview', attempts: 1 })
  })
})
