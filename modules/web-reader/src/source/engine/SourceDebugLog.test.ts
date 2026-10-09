import { describe, expect, it } from 'vitest'
import { checkDebugUrl, excerpt, logBookFields, logContentPayload, logRequestTrace, redactDebugText, type DebugWriter } from './SourceDebugLog'

describe('书源调试日志', () => {
  const capture = () => {
    const lines: string[] = []
    const write: DebugWriter = (tag, message, type = 'info') => lines.push(`${type} ${tag} ${message}`)
    return { lines, write }
  }
  it('区分未配置、配置后为空、有值和脚本返回', () => {
    const { lines, write } = capture()
    logBookFields(write, 'SEARCH', { name: '书名', coverUrl: 'https://twkan.com/cover.jpg' }, { author: '.author' })
    expect(lines.join('\n')).toContain('warn SEARCH 作者 (author): 规则已配置但结果为空')
    expect(lines.join('\n')).toContain('封面地址 (coverUrl): https://twkan.com/cover.jpg')
    expect(lines.join('\n')).toContain('更新时间 (updateTime): 规则未配置')
    const script = capture()
    logBookFields(script.write, 'SEARCH', { name: '脚本书' }, undefined, true)
    expect(script.lines.join('\n')).toContain('[脚本返回]')
    expect(script.lines.join('\n')).not.toContain('规则未配置')
  })
  it('诊断重复地址，同时允许 URL 请求选项及正常查询值', () => {
    expect(checkDebugUrl('https://twkan.com/book/1.html https://twkan.com/book/1.html')).toContain('空白')
    expect(checkDebugUrl('https://twkan.com/book/1.html,{"method":"POST", "body":"a b"}')).toBeUndefined()
    expect(checkDebugUrl('https://example.com/?redirect=https://other.com')).toBeUndefined()
    expect(checkDebugUrl('/relative')).toContain('无效')
  })
  it('保持正常 URL，脱敏认证参数、凭据和请求选项', () => {
    expect(redactDebugText('https://twkan.com/book/1.html')).toBe('https://twkan.com/book/1.html')
    const text = redactDebugText('https://user:pass@host/?token=secret&key=book#access_token=hidden')
    expect(text).not.toMatch(/secret|hidden|user:pass/)
    expect(text).toContain('key=book')
    expect(redactDebugText('https://host/,{"headers":{"Authorization":"secret"}}')).not.toContain('secret')
  })
  it('标注截断原长，正文首尾分别预览，图片不计入字符数', () => {
    expect(excerpt('短文', 200)).toBe('短文')
    expect(excerpt('a'.repeat(201), 200)).toContain('原始 201 字符')
    const { lines, write } = capture()
    logContentPayload(write, { type: 'text', title: '第一章', text: '头'.repeat(130) + '尾'.repeat(130) })
    expect(lines[1]).toContain('头'.repeat(120))
    expect(lines[2]).toContain('尾'.repeat(120))
    logContentPayload(write, { type: 'images', sourceUrl: 'https://host/', images: [{ url: 'https://host/1.jpg', index: 0 }] })
    expect(lines[lines.length - 1]).toContain('字符数=0；图片数=1')
  })
  it('请求诊断不输出 headers 或 body，含真实状态和通道', () => {
    const { lines, write } = capture()
    logRequestTrace(write, {
      sourceId: 'x', stage: 'bookInfo', durationMs: 8, attempts: 2, channel: 'webview',
      request: { sourceId: 'x', method: 'POST', url: 'https://host/', headers: { Cookie: 'secret' }, body: 'private' },
      response: { status: 403, finalUrl: 'https://host/blocked', headers: {}, body: new Uint8Array(12) },
    })
    expect(lines[0]).toContain('HTTP 错误响应')
    expect(lines[0]).toContain('通道=webview')
    expect(lines[0]).not.toMatch(/secret|private/)
  })
})
