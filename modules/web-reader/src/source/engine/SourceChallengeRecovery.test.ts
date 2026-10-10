// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SourceEngine, detectSecurityChallenge, type SourceEngineRequestTrace } from './SourceEngine'
import type { BookSource } from '@/source/types/BookSource'
import type { SourceRequest, SourceResponse, SourceTransport } from '@/source/transport/SourceTransport'
import { SourceTransportError } from '@/source/transport/SourceTransport'

const source: BookSource = {
  bookSourceUrl: 'https://twkan.com', bookSourceName: '挑战恢复样本', bookSourceType: 0, enabled: true,
  useWebView: true, enabledCookieJar: true,
  searchUrl: '/search/{{key}}', ruleSearch: { bookList: 'li', name: 'a@text', bookUrl: 'a@href' },
  ruleBookInfo: { name: 'h1@text', tocUrl: 'a@href' },
  ruleToc: { chapterList: 'a', chapterName: 'text', chapterUrl: 'href' }, ruleContent: { content: 'p@text' },
}
const page = '<h1>书名</h1><li><a href="/book">书名</a></li><a href="/chapter">第一章</a><p>正文</p>'
const reply = (html = page, status = 200, headers = {}): SourceResponse => ({
  body: new TextEncoder().encode(html), status, headers, finalUrl: 'https://twkan.com/page', channel: 'webview',
})
const challenge = (status = 403) => reply('<title>Just a moment...</title>', status, { 'cf-mitigated': 'challenge', 'cf-ray': 'sample-NRT' })
const solved = { success: true, html: page, cookies: ['cf_clearance=sample'], requiresManualInteraction: false }
const pending = { success: false, cookies: [], requiresManualInteraction: true }
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }

function fixture() {
  const transport = {
    request: vi.fn().mockResolvedValue(reply()),
    webviewFetch: vi.fn().mockResolvedValueOnce(challenge()).mockResolvedValue(reply()),
    solveChallenge: vi.fn().mockResolvedValue(solved),
    inspectChallenge: vi.fn().mockResolvedValue(solved),
    openAuthWindow: vi.fn().mockResolvedValue(undefined),
    closeAuthWindow: vi.fn().mockResolvedValue(undefined),
  }
  return { transport, engine: new SourceEngine({ transport, persistSourceVariables: false }) }
}

afterEach(() => vi.useRealTimers())

describe('统一请求层挑战恢复', () => {
  it('人工认证后原请求尚未结束时保持窗口显示', async () => {
    vi.useFakeTimers()
    const { engine, transport } = fixture()
    let finish!: (value: SourceResponse) => void
    transport.solveChallenge.mockResolvedValue(pending)
    transport.webviewFetch.mockReset().mockResolvedValueOnce(challenge())
      .mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const result = engine.search(source, '系统')
    await vi.advanceTimersByTimeAsync(500)
    expect(transport.openAuthWindow).toHaveBeenCalledTimes(1)
    expect(transport.webviewFetch).toHaveBeenCalledTimes(2)
    expect(transport.closeAuthWindow).not.toHaveBeenCalled()
    finish(reply())
    await expect(result).resolves.toHaveLength(1)
    expect(transport.closeAuthWindow).toHaveBeenCalledTimes(1)
  })

  it('并发认证请求全部完成后才隐藏共享窗口', async () => {
    vi.useFakeTimers()
    const { transport } = fixture()
    const finishes: Array<(value: SourceResponse) => void> = []
    transport.solveChallenge.mockResolvedValue(pending)
    transport.webviewFetch.mockReset().mockResolvedValueOnce(challenge()).mockResolvedValueOnce(challenge())
      .mockImplementation(() => new Promise(resolve => { finishes.push(resolve) }))
    const engine = new SourceEngine({ transport })
    const first = engine.search(source, '一')
    const second = engine.search(source, '二')
    await vi.advanceTimersByTimeAsync(500)
    expect(finishes).toHaveLength(2)
    finishes[0]!(reply())
    await first
    expect(transport.closeAuthWindow).not.toHaveBeenCalled()
    finishes[1]!(reply())
    await second
    expect(transport.openAuthWindow).toHaveBeenCalledTimes(1)
    expect(transport.closeAuthWindow).toHaveBeenCalledTimes(1)
  })

  it('认证后 GET 文档丢失补试一次即可在本轮成功，不重新认证', async () => {
    const { engine, transport } = fixture()
    transport.webviewFetch.mockReset().mockResolvedValueOnce(challenge())
      .mockRejectedValueOnce(new SourceTransportError('WEBVIEW_CONTEXT_LOST', '文档变化'))
      .mockResolvedValue(reply())
    await expect(engine.search(source, '系统')).resolves.toHaveLength(1)
    expect(transport.webviewFetch).toHaveBeenCalledTimes(3)
    expect(transport.webviewFetch.mock.calls[2]).toEqual(transport.webviewFetch.mock.calls[0])
    expect(transport.solveChallenge).toHaveBeenCalledTimes(1)
  })

  it('持续文档丢失不会无限补试', async () => {
    const { engine, transport } = fixture()
    transport.webviewFetch.mockReset().mockRejectedValue(new SourceTransportError('WEBVIEW_CONTEXT_LOST', '文档变化'))
    await expect(engine.search(source, '系统')).rejects.toMatchObject({ code: 'WEBVIEW_CONTEXT_LOST' })
    expect(transport.webviewFetch).toHaveBeenCalledTimes(2)
    expect(transport.solveChallenge).not.toHaveBeenCalled()
  })

  it('POST 文档丢失不重复发送可能已执行的请求', async () => {
    const { engine, transport } = fixture()
    transport.webviewFetch.mockReset().mockResolvedValueOnce(challenge())
      .mockRejectedValue(new SourceTransportError('WEBVIEW_CONTEXT_LOST', '文档变化'))
    await expect(engine.search({ ...source, searchUrl: '/search,{"method":"POST","body":"q={{key}}"}' }, '系统'))
      .rejects.toMatchObject({ code: 'WEBVIEW_CONTEXT_LOST' })
    expect(transport.webviewFetch).toHaveBeenCalledTimes(2)
  })

  it.each(['search', 'bookInfo', 'toc', 'content'] as const)('%s 的 403 先导航认证，再重试原请求', async stage => {
    const { engine, transport } = fixture()
    const run = {
      search: () => engine.search(source, '系统'), bookInfo: () => engine.getBookInfo(source, 'https://twkan.com/book'),
      toc: () => engine.getToc(source, 'https://twkan.com/toc'), content: () => engine.getContent(source, 'https://twkan.com/chapter'),
    }
    await expect(run[stage]()).resolves.toBeDefined()
    expect(transport.solveChallenge).toHaveBeenCalledExactlyOnceWith(source.bookSourceUrl, 'https://twkan.com/page', 5000)
    expect(transport.webviewFetch).toHaveBeenCalledTimes(2)
    expect(transport.webviewFetch.mock.calls[1]).toEqual(transport.webviewFetch.mock.calls[0])
    expect(transport.openAuthWindow).not.toHaveBeenCalled()
  })

  it.each([200, 503])('状态 %s 的验证页也恢复，reqwest 503 不先耗尽普通重试', async status => {
    const { transport } = fixture()
    transport.request.mockResolvedValueOnce(challenge(status)).mockResolvedValue(reply())
    const engine = new SourceEngine({ transport })
    await expect(engine.search({ ...source, useWebView: false }, '系统')).resolves.toHaveLength(1)
    expect(transport.request).toHaveBeenCalledTimes(2)
    expect(transport.solveChallenge).toHaveBeenCalledTimes(1)
    expect(transport.webviewFetch).not.toHaveBeenCalled()
  })

  it('重试保留 POST 请求体和所有传输选项，不用导航 HTML 替代原响应', async () => {
    const { engine, transport } = fixture()
    transport.solveChallenge.mockResolvedValue({ ...solved, html: '<p>仅供验证的导航页面，不含搜索结果</p>' })
    await engine.search({ ...source, enabledCookieJar: false,
      searchUrl: '/search,{"method":"POST","body":"q={{key}}","headers":{"X-Test":"keep"},"timeout":1234,"followRedirects":false,"webViewDelayTime":80,"enabledCookieJar":false}',
    }, '系统')
    const original = transport.webviewFetch.mock.calls[0]![0] as SourceRequest
    expect(original).toMatchObject({ method: 'POST', body: 'q=%E7%B3%BB%E7%BB%9F', timeout: 1234,
      followRedirects: false, webViewDelayTime: 80, useCookieJar: false, headers: { 'X-Test': 'keep' } })
    expect(transport.webviewFetch.mock.calls[1]![0]).toEqual(original)
  })

  it('需要人工认证时只导航一次；只读探测通过后隐藏窗口并重试', async () => {
    vi.useFakeTimers()
    const { engine, transport } = fixture()
    transport.solveChallenge.mockResolvedValue(pending)
    transport.inspectChallenge.mockResolvedValueOnce(pending).mockResolvedValue(solved)
    const result = engine.search(source, '系统')
    await flush()
    expect(transport.openAuthWindow).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(result).resolves.toHaveLength(1)
    expect(transport.inspectChallenge).toHaveBeenCalledTimes(2)
    expect(transport.solveChallenge).toHaveBeenCalledTimes(1)
    expect(transport.closeAuthWindow).toHaveBeenCalledTimes(1)
    expect(transport.webviewFetch).toHaveBeenCalledTimes(2)
  })

  it('后台导航失败也可显示窗口进行人工验证', async () => {
    vi.useFakeTimers()
    const { engine, transport } = fixture()
    transport.solveChallenge.mockRejectedValue(new Error('导航等待超时'))
    const result = engine.search(source, '系统')
    await vi.advanceTimersByTimeAsync(500)
    await expect(result).resolves.toHaveLength(1)
    expect(transport.openAuthWindow).toHaveBeenCalledTimes(1)
    expect(transport.inspectChallenge).toHaveBeenCalledTimes(1)
  })

  it('只读探测命令卡住时仍在人工验证时限内退出', async () => {
    vi.useFakeTimers()
    const { engine, transport } = fixture()
    transport.solveChallenge.mockResolvedValue(pending)
    transport.inspectChallenge.mockImplementation(() => new Promise(() => {}))
    const result = engine.search(source, '系统').catch(error => error)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await result).toMatchObject({ message: expect.stringContaining('超时') })
    expect(transport.inspectChallenge).toHaveBeenCalledTimes(1)
    expect(transport.closeAuthWindow).toHaveBeenCalledTimes(1)
  })

  it('认证后传输失败不会把之前的挑战响应误记为重试响应', async () => {
    const { transport } = fixture()
    transport.webviewFetch.mockReset().mockResolvedValueOnce(challenge()).mockRejectedValue(new Error('network'))
    const traces: SourceEngineRequestTrace[] = []
    const engine = new SourceEngine({ transport, onRequestTrace: trace => traces.push(trace) })
    await expect(engine.search(source, '系统')).rejects.toThrow('network')
    expect(traces[1]?.response).toBeUndefined()
    expect(traces[1]?.attempts).toBe(2)
    expect(transport.solveChallenge).toHaveBeenCalledTimes(1)
  })

  it('人工验证超时会隐藏窗口并退出，不重试原请求', async () => {
    vi.useFakeTimers()
    const { engine, transport } = fixture()
    transport.solveChallenge.mockResolvedValue(pending)
    transport.inspectChallenge.mockResolvedValue(pending)
    const result = engine.search(source, '系统').catch(error => error)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await result).toMatchObject({ name: 'CloudflareChallengeError', message: expect.stringContaining('超时'),
      diagnostics: { requiresManualInteraction: true } })
    expect(transport.closeAuthWindow).toHaveBeenCalledTimes(1)
    expect(transport.webviewFetch).toHaveBeenCalledTimes(1)
  })

  it('原请求重试仍遇挑战时有界退出，并提示 Cookie 策略', async () => {
    const { engine, transport } = fixture()
    transport.webviewFetch.mockReset().mockResolvedValue(challenge())
    await expect(engine.search({ ...source, enabledCookieJar: false }, '系统')).rejects.toThrow('当前未启用保存 Cookie')
    expect(transport.solveChallenge).toHaveBeenCalledTimes(1)
    expect(transport.webviewFetch).toHaveBeenCalledTimes(2)
    expect(transport.openAuthWindow).not.toHaveBeenCalled()
  })

  it('同一书源并发请求共享认证，各自重试自己的地址', async () => {
    const { transport } = fixture()
    const counts = new Map<string, number>()
    transport.webviewFetch.mockReset().mockImplementation(async (request: SourceRequest) => {
      const count = counts.get(request.url) || 0
      counts.set(request.url, count + 1)
      return count === 0 ? challenge() : reply()
    })
    const first = new SourceEngine({ transport }), second = new SourceEngine({ transport })
    await Promise.all([first.search(source, '系统'), second.getContent(source, 'https://twkan.com/chapter')])
    expect(transport.solveChallenge).toHaveBeenCalledTimes(1)
    expect([...counts.values()]).toEqual([2, 2])
  })

  it('取消人工等待后不再探测或重试，并隐藏窗口', async () => {
    vi.useFakeTimers()
    const { transport } = fixture()
    transport.solveChallenge.mockResolvedValue(pending)
    const controller = new AbortController()
    const engine = new SourceEngine({ transport, signal: controller.signal })
    const result = engine.search(source, '系统').catch(error => error)
    await flush()
    controller.abort()
    expect(await result).toMatchObject({ name: 'AbortError' })
    await flush()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(transport.inspectChallenge).not.toHaveBeenCalled()
    expect(transport.webviewFetch).toHaveBeenCalledTimes(1)
    expect(transport.closeAuthWindow).toHaveBeenCalledTimes(1)
  })

  it('一个并发调用取消不影响另一个等待者', async () => {
    const { transport } = fixture()
    transport.webviewFetch.mockReset().mockResolvedValueOnce(challenge()).mockResolvedValueOnce(challenge()).mockResolvedValue(reply())
    let release!: (value: typeof solved) => void
    transport.solveChallenge.mockImplementation(() => new Promise(resolve => { release = resolve }))
    const controller = new AbortController()
    const first = new SourceEngine({ transport, signal: controller.signal }).search(source, '一').catch(error => error)
    const second = new SourceEngine({ transport }).search(source, '二')
    await flush()
    controller.abort()
    expect(await first).toMatchObject({ name: 'AbortError' })
    release(solved)
    await expect(second).resolves.toHaveLength(1)
    expect(transport.solveChallenge).toHaveBeenCalledTimes(1)
  })

  it('普通 403 不触发认证，无认证能力时给出准确错误', async () => {
    const { engine, transport } = fixture()
    transport.webviewFetch.mockReset().mockResolvedValue(reply('Forbidden', 403))
    await expect(engine.search(source, '系统')).rejects.toThrow('HTTP 403')
    expect(transport.solveChallenge).not.toHaveBeenCalled()
    const unsupported: SourceTransport = { request: async () => challenge() }
    await expect(new SourceEngine({ transport: unsupported }).search(source, '系统')).rejects.toThrow('不支持自动认证')
  })

  it('记录挑战与原请求恢复结果，不把导航 HTML 当作成功响应', async () => {
    const { transport } = fixture()
    const traces: SourceEngineRequestTrace[] = []
    await new SourceEngine({ transport, onRequestTrace: trace => traces.push(trace) }).search(source, '系统')
    expect(traces).toHaveLength(2)
    expect(traces[0]).toMatchObject({ response: { status: 403 }, attempts: 1, error: { name: 'CloudflareChallengeError' } })
    expect(traces[1]).toMatchObject({ response: { status: 200 }, attempts: 2, channel: 'webview' })
  })

  it('cf-mitigated 标头足以识别挑战，无需完整 HTML 特征', () => {
    expect(detectSecurityChallenge('', challenge())).toMatchObject({ isChallenge: true, type: 'cloudflare' })
  })
})
