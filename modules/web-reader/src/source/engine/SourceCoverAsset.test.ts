// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SourceEngine, SecurityChallengeError } from './SourceEngine'
import type { SourceRequest } from '@/source/transport/SourceTransport'
import type { BookSource } from '@/source/types/BookSource'
import * as scripts from '@/platform/sourceScripts'

const source: BookSource = {
  bookSourceName: 'TWKan', bookSourceUrl: 'https://twkan.com', enabled: true, bookSourceType: 0,
  useWebView: true, enabledCookieJar: true, header: '{"User-Agent":"test-agent","Referer":"https://twkan.com/"}',
  ruleContent: { imageDecode: 'return [9]' },
}
afterEach(() => vi.restoreAllMocks())
describe('封面二进制请求', () => {
  it('携带书源配置和 binary 参数，保留原始字节，封面不执行正文解码', async () => {
    const body = new Uint8Array([0xff, 0xd8, 0x80, 0xfe, 0xff, 0xd9])
    const webviewFetch = vi.fn(async (_request: SourceRequest) => ({ body, status: 200, finalUrl: 'https://twkan.com/cover.jpg', headers: { 'Content-Type': 'image/jpeg' } }))
    const decode = vi.spyOn(scripts, 'executeSourceJavaScript').mockResolvedValue({ result: [9], logs: [] })
    const engine = new SourceEngine({ transport: { request: vi.fn(), webviewFetch } })
    const result = await engine.fetchSourceAsset(source, 'https://twkan.com/cover.jpg', 'https://twkan.com/book/1', { cover: true, retry: 0, timeout: 10000 })
    expect(result.body).toEqual(body)
    expect(webviewFetch.mock.calls[0]?.[0]).toMatchObject({ responseType: 'binary', useCookieJar: true, useWebView: true, retry: 0, timeout: 10000, headers: { 'User-Agent': 'test-agent', Referer: 'https://twkan.com/' } })
    expect(decode).not.toHaveBeenCalled()
    expect((await engine.fetchSourceAsset(source, 'https://twkan.com/cover.jpg', 'https://twkan.com/book/1')).body).toEqual(new Uint8Array([9]))
    expect(decode).toHaveBeenCalledTimes(1)
  })
  it('200 验证 HTML 也被识别为质询，而不是传给图片解码器', async () => {
    const engine = new SourceEngine({ transport: { request: vi.fn(), webviewFetch: async () => ({
      body: new TextEncoder().encode('<title>Just a moment...</title><div>cf-chl-platform</div>'),
      status: 200, finalUrl: 'https://twkan.com/cover.jpg', headers: { 'content-type': 'text/html' },
    }) } })
    await expect(engine.fetchSourceAsset(source, 'https://twkan.com/cover.jpg', source.bookSourceUrl, { cover: true })).rejects.toBeInstanceOf(SecurityChallengeError)
  })
})
