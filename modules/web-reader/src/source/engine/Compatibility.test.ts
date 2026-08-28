import { describe, expect, it } from 'vitest'
import { inspectSourceCompatibility } from './Compatibility'
import type { BookSource } from '@/source/types/BookSource'

function source(overrides: Partial<BookSource> = {}): BookSource {
  return {
    bookSourceUrl: 'https://example.com', bookSourceName: '测试', bookSourceType: 0,
    enabled: true, ...overrides,
  }
}

describe('书源兼容性扫描', () => {
  it('不把扫描结果写回书源，并识别模式', () => {
    const value = source({ webReaderCompatibilityMode: 'standard' })
    const report = inspectSourceCompatibility(value)
    expect(report).toMatchObject({
      status: 'supported', mode: 'standard', verificationStatus: 'untested', engineVersion: 2,
    })
    expect(value).not.toHaveProperty('compatibilityReport')
  })

  it('区分静态能力、loginUi 与格式错误的字符串类型值', () => {
    const report = inspectSourceCompatibility(source({
      bookSourceType: '0' as unknown as number,
      loginUrl: '/login', loginUi: '[{"type":"text"}]',
      ruleContent: { content: '@Json:$.data@js:result', nextContentUrl: '@XPath://a/@href' },
    }))
    expect(report.status).toBe('unsupported')
    expect(report.capabilities).toEqual(expect.arrayContaining(['manual-login', 'jsonpath', 'javascript', 'xpath']))
    expect(report.issues.map(item => item.code)).toContain('UNSUPPORTED_LOGIN_UI')
    expect(report.issues.map(item => item.code)).toContain('INVALID_SOURCE_TYPE')
  })

  it('允许导入但标记不支持的类型与 Android API', () => {
    const report = inspectSourceCompatibility(source({
      bookSourceType: 1,
      mainJs: 'return Packages.io.legado.app.help.AppWebView()'
    }))
    expect(report.status).toBe('unsupported')
    expect(report.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'UNSUPPORTED_SOURCE_TYPE', 'UNSUPPORTED_ANDROID_API',
    ]))
  })
})
