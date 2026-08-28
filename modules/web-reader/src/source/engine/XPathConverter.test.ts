import { describe, expect, it } from 'vitest'
import {
  convertSingleXPathToCss,
  convertLegadoRuleXPathToCss,
  convertBookSourceXPath,
  isXPathRule,
} from './XPathConverter'
import type { BookSource } from '@/source/types/BookSource'

describe('XPathConverter - isXPathRule', () => {
  it('正确识别 XPath 表达式', () => {
    expect(isXPathRule('//div[@id="content"]')).toBe(true)
    expect(isXPathRule('@XPath://a/@href')).toBe(true)
    expect(isXPathRule('xpath:/div/p')).toBe(true)
    expect(isXPathRule('.//a[@class="link"]')).toBe(true)
    expect(isXPathRule('.item//a')).toBe(true)
    expect(isXPathRule('text()')).toBe(true)
    expect(isXPathRule('html()')).toBe(true)
    expect(isXPathRule('@href')).toBe(true)
    expect(isXPathRule('a/@href')).toBe(true)
    expect(isXPathRule('h3/a/text()')).toBe(true)
    expect(isXPathRule('./div/p')).toBe(true)
  })

  it('排除非 XPath 规则', () => {
    expect(isXPathRule('.title@text')).toBe(false)
    expect(isXPathRule('#content p@text')).toBe(false)
    expect(isXPathRule('tag.p@text')).toBe(false)
    expect(isXPathRule('$.data.books[*]')).toBe(false)
    expect(isXPathRule('@js:result')).toBe(false)
  })
})

describe('XPathConverter - convertSingleXPathToCss', () => {
  it('基础元素、ID 与 Class 转换', () => {
    expect(convertSingleXPathToCss('//div[@id="content"]/text()')).toEqual({
      success: true,
      result: '#content@text',
    })
    expect(convertSingleXPathToCss('//*[@id="list"]/dl/dd/a/@href')).toEqual({
      success: true,
      result: '#list > dl > dd > a@href',
    })
    expect(convertSingleXPathToCss('//div[@class="book-item"]//a/@href')).toEqual({
      success: true,
      result: '.book-item a@href',
    })
    expect(convertSingleXPathToCss('//div[@class="btn primary"]')).toEqual({
      success: true,
      result: '.btn.primary',
    })
  })

  it('属性过滤与匹配运算', () => {
    expect(convertSingleXPathToCss('//a[contains(@href, "chapter")]/@href')).toEqual({
      success: true,
      result: 'a[href*="chapter"]@href',
    })
    expect(convertSingleXPathToCss('//a[starts-with(@href, "http")]/@href')).toEqual({
      success: true,
      result: 'a[href^="http"]@href',
    })
    expect(convertSingleXPathToCss('//img[ends-with(@src, ".jpg")]/@src')).toEqual({
      success: true,
      result: 'img[src$=".jpg"]@src',
    })
    expect(convertSingleXPathToCss('//p[not(@class)]/text()')).toEqual({
      success: true,
      result: 'p:not([class])@text',
    })
    expect(convertSingleXPathToCss('//div[@class="a" and @data-id="1"]')).toEqual({
      success: true,
      result: '.a[data-id="1"]',
    })
  })

  it('位置索引', () => {
    expect(convertSingleXPathToCss('//div[@class="intro"]/p[1]/text()')).toEqual({
      success: true,
      result: '.intro > p:first-of-type@text',
    })
    expect(convertSingleXPathToCss('//div[@class="intro"]/p[2]/text()')).toEqual({
      success: true,
      result: '.intro > p:nth-of-type(2)@text',
    })
    expect(convertSingleXPathToCss('//div[@class="intro"]/p[last()]/text()')).toEqual({
      success: true,
      result: '.intro > p:last-of-type@text',
    })
  })

  it('包含前缀 @XPath: 或 xpath: 的自动去除', () => {
    expect(convertSingleXPathToCss('@XPath://div[@id="intro"]')).toEqual({
      success: true,
      result: '#intro',
    })
    expect(convertSingleXPathToCss('xpath://h1/text()')).toEqual({
      success: true,
      result: 'h1@text',
    })
    expect(convertSingleXPathToCss('text()')).toEqual({
      success: true,
      result: '@text',
    })
    expect(convertSingleXPathToCss('@href')).toEqual({
      success: true,
      result: '@href',
    })
    expect(convertSingleXPathToCss('a/@href')).toEqual({
      success: true,
      result: 'a@href',
    })
    expect(convertSingleXPathToCss('./div/p/text()')).toEqual({
      success: true,
      result: 'div > p@text',
    })
  })

  it('安全跳过不兼容的高级语法', () => {
    expect(convertSingleXPathToCss('//dd[preceding-sibling::dt[1]]/a').success).toBe(false)
    expect(convertSingleXPathToCss('//a[contains(text(), "下一页")]').success).toBe(false)
    expect(convertSingleXPathToCss('//a[contains(., "正文")]').success).toBe(false)
    expect(convertSingleXPathToCss('//div/..').success).toBe(false)
    expect(convertSingleXPathToCss('//div[count(p) > 5]').success).toBe(false)
  })
})

describe('XPathConverter - convertLegadoRuleXPathToCss', () => {
  it('支持 || 复合规则转换并保留连接符', () => {
    const rule = '@XPath://a[@class="a"]/@href || @XPath://a[@class="b"]/@href'
    const res = convertLegadoRuleXPathToCss(rule)
    expect(res.changed).toBe(true)
    expect(res.result).toBe('a.a@href || a.b@href')
  })

  it('支持保留 ## 正则替换后缀', () => {
    const rule = '//div[@id="title"]/text()##\\s+##'
    const res = convertLegadoRuleXPathToCss(rule)
    expect(res.changed).toBe(true)
    expect(res.result).toBe('#title@text##\\s+##')
  })

  it('非 XPath 规则保持原样', () => {
    const rule = '.title@text##\\d+##'
    const res = convertLegadoRuleXPathToCss(rule)
    expect(res.changed).toBe(false)
    expect(res.result).toBe(rule)
  })

  it('部分子项不可转换时，保留不可转换子项并转换有效子项', () => {
    const rule = '//a[@class="a"]/@href || //dd[preceding-sibling::dt]/a/@href'
    const res = convertLegadoRuleXPathToCss(rule)
    expect(res.changed).toBe(true)
    expect(res.result).toBe('a.a@href || //dd[preceding-sibling::dt]/a/@href')
  })
})

describe('XPathConverter - convertBookSourceXPath', () => {
  it('扫描并批量转换书源的规则字段', () => {
    const sampleSource: BookSource = {
      bookSourceName: '测试书源',
      bookSourceUrl: 'https://example.com',
      bookSourceType: 0,
      enabled: true,
      ruleSearch: {
        bookList: '//*[@class="book-list"]//li',
        name: '//h3/a/text()',
        bookUrl: '//h3/a/@href',
        author: '.author@text', // 已是 CSS
      },
      ruleBookInfo: {
        tocUrl: '//a[contains(@href, "catalog")]/@href',
      },
      ruleToc: {
        chapterList: '//ul[@id="chapters"]/li/a',
        chapterName: 'text()',
        chapterUrl: '@href',
      },
      ruleContent: {
        content: '//div[@id="content"]/text()##广告##',
        nextContentUrl: '//dd[preceding-sibling::dt]/a/@href', // 不安全，应跳过
      },
    }

    const summary = convertBookSourceXPath(sampleSource)

    expect(summary.convertedCount).toBe(7)
    expect(summary.skippedCount).toBe(1)
    expect(summary.source.ruleSearch?.bookList).toBe('.book-list li')
    expect(summary.source.ruleSearch?.name).toBe('h3 > a@text')
    expect(summary.source.ruleSearch?.bookUrl).toBe('h3 > a@href')
    expect(summary.source.ruleSearch?.author).toBe('.author@text')
    expect(summary.source.ruleBookInfo?.tocUrl).toBe('a[href*="catalog"]@href')
    expect(summary.source.ruleToc?.chapterList).toBe('#chapters > li > a')
    expect(summary.source.ruleToc?.chapterName).toBe('@text')
    expect(summary.source.ruleToc?.chapterUrl).toBe('@href')
    expect(summary.source.ruleContent?.content).toBe('#content@text##广告##')
    expect(summary.source.ruleContent?.nextContentUrl).toBe('//dd[preceding-sibling::dt]/a/@href')
  })
})
