import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

import { invoke } from '@tauri-apps/api/core'
import { TauriTransport } from './TauriTransport'

describe('TauriTransport', () => {
  beforeEach(() => vi.clearAllMocks())

  it('优先按 kind=dns 分类，不被 timeout=false 误判为超时', async () => {
    vi.mocked(invoke).mockRejectedValue(
      'Request failed [stage=send, kind=dns, connect=true, timeout=false]: dns error -> Disallowed IP address: 198.18.0.112',
    )

    await expect(new TauriTransport().request({
      sourceId: 'source-1',
      url: 'https://www.cunshu.la/read/example',
      method: 'GET',
    })).rejects.toMatchObject({
      name: 'SourceTransportError',
      code: 'DNS_RESOLUTION_FAILED',
    })
  })

  it('保留 kind=timeout 的真实超时分类', async () => {
    vi.mocked(invoke).mockRejectedValue(
      'Request failed [stage=send, kind=timeout, connect=false, timeout=true]: operation timed out',
    )

    await expect(new TauriTransport().request({
      sourceId: 'source-1',
      url: 'https://example.com/books',
      method: 'GET',
    })).rejects.toMatchObject({
      name: 'SourceTransportError',
      code: 'REQUEST_TIMEOUT',
    })
  })

  it('webview_fetch 使用类型化 request 载荷传递全部 WebView 请求字段', async () => {
    vi.mocked(invoke).mockResolvedValue({
      status: 200,
      finalUrl: 'https://example.com/final',
      headers: { 'content-type': 'text/plain' },
      body: [111, 107],
      charset: 'utf-8',
    })

    const response = await new TauriTransport().webviewFetch({
      sourceId: 'source-1',
      url: 'https://example.com/start',
      method: 'POST',
      headers: { accept: 'text/plain' },
      body: 'payload',
      timeout: 12_000,
      webViewDelayTime: 300,
      followRedirects: false,
      useCookieJar: false,
      responseType: 'binary',
    })

    expect(invoke).toHaveBeenCalledWith('webview_fetch', {
      request: {
        sourceId: 'source-1',
        url: 'https://example.com/start',
        method: 'POST',
        headers: { accept: 'text/plain' },
        body: 'payload',
        timeoutMs: 12_000,
        delayMs: 300,
        followRedirects: false,
        useCookieJar: false,
        responseType: 'binary',
      },
    })
    expect(response.body).toEqual(new Uint8Array([111, 107]))
    expect(response.channel).toBe('webview')
  })
})
