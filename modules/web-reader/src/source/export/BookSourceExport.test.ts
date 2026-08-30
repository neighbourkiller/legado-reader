import { describe, expect, it } from 'vitest'
import type { BookSource } from '@/source/types/BookSource'
import {
  createBookSourceJsonFileName,
  serializeLegadoBookSources,
  toLegadoBookSourceJson,
} from './BookSourceExport'

describe('书源 JSON 导出', () => {
  it('只导出原版 BookSource 字段，并过滤 Web Reader 扩展字段', () => {
    const source = {
      bookSourceUrl: 'https://example.com',
      bookSourceName: '示例书源',
      bookSourceType: 0,
      enabled: true,
      useWebView: true,
      webReaderCompatibilityMode: 'standard',
      isTop: true,
      variableMap: { token: 'secret' },
      unknownField: 'web-only',
      ruleSearch: {
        checkKeyWord: '示例',
        bookList: '.books',
        webOnlyRule: '.unsupported',
      },
    } as BookSource

    expect(toLegadoBookSourceJson(source)).toEqual({
      bookSourceUrl: 'https://example.com',
      bookSourceName: '示例书源',
      bookSourceType: 0,
      enabled: true,
      ruleSearch: {
        checkKeyWord: '示例',
        bookList: '.books',
      },
    })
  })

  it('不补写输入书源中不存在的原版字段，并按数组格式导出', () => {
    const source = {
      bookSourceUrl: 'https://minimal.example.com',
      bookSourceName: '最小书源',
    } as BookSource

    const exported = JSON.parse(serializeLegadoBookSources([source]))

    expect(exported).toEqual([{
      bookSourceUrl: 'https://minimal.example.com',
      bookSourceName: '最小书源',
    }])
    expect(exported[0]).not.toHaveProperty('useWebView')
    expect(exported[0]).not.toHaveProperty('enabled')
  })

  it('生成适合另存为对话框的安全文件名', () => {
    const source = { bookSourceName: '测试/书源:*?' } as BookSource
    expect(createBookSourceJsonFileName(source)).toBe('测试_书源___.json')
  })
})
