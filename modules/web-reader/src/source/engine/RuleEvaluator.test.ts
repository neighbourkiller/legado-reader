// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { compileRule, splitRuleCombination } from './RuleCompiler'
import {
  evaluateRuleList,
  evaluateRuleListAsync,
  evaluateRuleString,
  evaluateRuleStringAsync,
  type RuleScriptRunner,
} from './RuleEvaluator'
import { RuleExecutionError } from './RuleTypes'
import { isLegadoTrue } from './TocParser'
import { formatOnlineContent } from './ContentParser'
import { applyTextReplaceRule } from './RuleParser'
import fixtures from '../../../../../testdata/source-compat/rule-fixtures.json'

describe('Legado 规则编译器', () => {
  it('不会拆开引号、括号和 JS 中的组合符', () => {
    expect(splitRuleCombination(`@Json:$.items[?(@.name == 'a||b')] || $.fallback`)).toEqual({
      operator: '||',
      parts: [`@Json:$.items[?(@.name == 'a||b')] `, ' $.fallback'],
    })
    expect(compileRule(`<js>result.includes('a||b') ? result : ''</js>||.fallback`).alternatives)
      .toHaveLength(2)
    expect(compileRule(`@js:result || 'fallback'`).alternatives).toHaveLength(1)
  })

  it('保留替换表达式中的组合符', () => {
    const segment = compileRule(`@CSS:.title@text##a\\|\\|b##ok`).alternatives[0]!
    expect(segment.expression).toBe('.title@text')
    expect(segment.replacePattern).toBe('a\\|\\|b')
  })
})

describe('Legado DOM/JSON 执行器', () => {
  it('支持简写、排除、负索引、区间和属性提取', () => {
    const html = `<ul id="items"><li><a href="/0">0</a></li><li><a href="/1">1</a></li><li><a href="/2">2</a></li><li><a href="/3">3</a></li></ul>`
    expect(evaluateRuleList(html, 'id.items@li!0').map(value => evaluateRuleString(value as Element, 'a@text')))
      .toEqual(['1', '2', '3'])
    expect(evaluateRuleString(html, 'id.items@li.-1@a@href')).toBe('/3')
    expect(evaluateRuleList(html, 'id.items@li[1:3:2]')).toHaveLength(2)
    // 验证切片反向排序不被 DOM 原序打乱
    expect(evaluateRuleList(html, 'id.items@li[-1:0]').map(value => evaluateRuleString(value as Element, 'a@text')))
      .toEqual(['3', '2', '1', '0'])

    // 验证任意合法 HTML 属性提取（不受 7 个白名单限制）
    const attrHtml = `<img src="/cover.jpg" alt="封面图" data-custom="12345" aria-label="标题" />`
    expect(evaluateRuleString(attrHtml, 'img@alt')).toBe('封面图')
    expect(evaluateRuleString(attrHtml, 'img@data-custom')).toBe('12345')
    expect(evaluateRuleString(attrHtml, 'img@aria-label')).toBe('标题')
  })

  it('支持完整的 IR 语法树结构与步骤编译', () => {
    const compiled = compileRule('div.box@tag.p[-1:0]@text##foo##bar')
    expect(compiled.tree?.type).toBe('combination')
    expect(compiled.alternatives[0]?.steps).toHaveLength(3)
    expect(compiled.alternatives[0]?.steps?.[1]?.expression).toBe('tag.p')
    expect(compiled.alternatives[0]?.steps?.[1]?.spec?.tokens).toEqual(['-1:0'])
    expect(compiled.alternatives[0]?.steps?.[1]?.bracketSyntax).toBe(true)
    expect(compiled.alternatives[0]?.steps?.[2]?.directive).toBe('text')
  })

  it('支持安全 JSONPath 过滤和组合结果', () => {
    const json = JSON.stringify({ items: [{ score: 1, name: 'a' }, { score: 3, name: 'b' }] })
    expect(evaluateRuleString(json, `@Json:$.items[?(@.score > 1)].name`)).toBe('b')
    expect(evaluateRuleString(`<p class="a">A</p><p class="b">B</p>`, '.a@text&&.b@text'))
      .toBe('A\nB')
  })

  it('支持显式正则提取', () => {
    expect(evaluateRuleString('a=12;b=34', '@Regex:=([0-9]+)')).toBe('12\n34')
  })

  it('支持 @put、@get 与基础上下文模板', () => {
    const variables = new Map<string, string>()
    const html = `<p class="token">saved</p><p class="saved">value</p>`
    expect(evaluateRuleString(html, `@put:{"selector":".token@text"}.@get:{selector}@text`, {
      compatibilityMode: 'legado', variables,
    })).toBe('value')
    expect(variables.get('selector')).toBe('saved')
    expect(evaluateRuleString(`<p class="p2">ok</p>`, `.p{{page}}@text`, {
      compatibilityMode: 'legado', page: 2,
    })).toBe('ok')
    expect(evaluateRuleString({ ordernum: 1, title: '第一章' }, 'p{{$.ordernum}}.html', {
      compatibilityMode: 'legado',
    })).toBe('p1.html')
    expect(evaluateRuleString({ id: 12345 }, '/read/{{$.id}}/', {
      compatibilityMode: 'legado',
    })).toBe('/read/12345/')
  })

  it('为无效规则抛出结构化错误', () => {
    expect(() => evaluateRuleList('<p>x</p>', '@XPath://*[' , {
      stage: 'toc', field: 'chapterList', compatibilityMode: 'legado',
    })).toThrowError(RuleExecutionError)
    try {
      evaluateRuleList('<p>x</p>', '@XPath://*[', {
        stage: 'toc', field: 'chapterList', compatibilityMode: 'legado',
      })
    } catch (error) {
      expect(error).toMatchObject({
        code: 'INVALID_XPATH', stage: 'toc', field: 'chapterList', compatibilityMode: 'legado',
      })
    }
  })

  it('对齐 Android 目录布尔判定 String?.isTrue() 语义', () => {
    expect(isLegadoTrue('true')).toBe(true)
    expect(isLegadoTrue('yes')).toBe(true)
    expect(isLegadoTrue('1')).toBe(true)
    expect(isLegadoTrue('.vip-badge')).toBe(true)
    expect(isLegadoTrue('false')).toBe(false)
    expect(isLegadoTrue('0')).toBe(false)
    expect(isLegadoTrue('0.0')).toBe(false)
    expect(isLegadoTrue('no')).toBe(false)
    expect(isLegadoTrue('not')).toBe(false)
    expect(isLegadoTrue('null')).toBe(false)
    expect(isLegadoTrue('')).toBe(false)
    expect(isLegadoTrue(undefined)).toBe(false)
  })

  it('保留正文内嵌图片的原位段落排版并转换为规范标签', () => {
    const rawHtml = `
      <p>第一段文字</p>
      <p><img src="/uploads/pic1.jpg" alt="第一张插图"></p>
      <div><img data-src="https://img.example.com/pic2.png" /></div>
      <p>第二段文字</p>
    `
    const formatted = formatOnlineContent(rawHtml, 'https://example.com/book/')
    const paragraphs = formatted.split('\n')
    expect(paragraphs[0]).toBe('第一段文字')
    expect(paragraphs[1]).toBe('<img src="https://example.com/uploads/pic1.jpg" />')
    expect(paragraphs[2]).toBe('<img src="https://img.example.com/pic2.png" />')
    expect(paragraphs[3]).toBe('第二段文字')
  })

  it('正则替换规则错误抛出结构化 RuleExecutionError', () => {
    expect(() => applyTextReplaceRule('test text', '##(?+invalid##replacement'))
      .toThrowError(RuleExecutionError)
  })
})

describe('XPath 兼容模式', () => {
  const reverse = fixtures.find(item => item.id === 'yingshu-reverse-axis-first')!
  const portableFixture = fixtures.find(item => item.id === 'portable-following-sibling')!
  const xpath = reverse.rule

  it('standard 保留浏览器反向轴语义', () => {
    expect(evaluateRuleList(reverse.html, xpath, { compatibilityMode: 'standard' }).map(value =>
      evaluateRuleString(value as Element, '@text'))).toEqual(reverse.standardExpected)
  })

  it('legado 复现 JsoupXpath 2.5.3 的正向位置差异', () => {
    expect(evaluateRuleList(reverse.html, xpath, { compatibilityMode: 'legado' }).map(value =>
      evaluateRuleString(value as Element, '@text'))).toEqual(reverse.androidExpected)
  })

  it('双方兼容写法在两种模式下结果相同', () => {
    expect(evaluateRuleList(portableFixture.html, portableFixture.rule, { compatibilityMode: 'legado' }).map(value =>
      evaluateRuleString(value as Element, '@text'))).toEqual(portableFixture.androidExpected)
    expect(evaluateRuleList(portableFixture.html, portableFixture.rule, { compatibilityMode: 'standard' }).map(value =>
      evaluateRuleString(value as Element, '@text'))).toEqual(portableFixture.standardExpected)
  })
})

describe('共享 source-compat 夹具验证', () => {
  fixtures.forEach((fixture) => {
    if (fixture.id === 'yingshu-reverse-axis-first') return
    it(`验证夹具 [${fixture.id}]`, () => {
      if (fixture.mode === 'string') {
        const actual = evaluateRuleString(fixture.html, fixture.rule, { compatibilityMode: 'legado' })
        expect(actual ? [actual] : []).toEqual(fixture.androidExpected)
      } else {
        const elements = evaluateRuleList(fixture.html, fixture.rule, { compatibilityMode: 'legado' })
        const actual = elements.map(el => evaluateRuleString(el as Element, '@text'))
        expect(actual).toEqual(fixture.androidExpected)
      }
    })
  })
})

describe('异步脚本规则', () => {
  it('把声明式规则结果传入链式 JavaScript', async () => {
    const runner: RuleScriptRunner = {
      javascript: async (_code, _context, input) => String(input).toUpperCase(),
      webJavascript: async () => '',
    }
    await expect(evaluateRuleStringAsync(
      '<p class="name">legado</p>', '.name@text@js:result',
      { compatibilityMode: 'legado' }, runner,
    )).resolves.toBe('LEGADO')
  })
})

describe('G1: 复合逻辑运算符树', () => {
  const html = `
    <div class="card">
      <span class="alt-title">备用书名</span>
      <span class="author">作者甲</span>
      <span class="author">作者乙</span>
      <span class="cat1">玄幻</span>
      <span class="cat2">修真</span>
    </div>
  `

  it('支持括号表达式与优先级结合：(A || B) && C', () => {
    const rule = '(class.fake-title@text || class.alt-title@text) && class.author@text'
    const result = evaluateRuleString(html, rule)
    expect(result).toBe('备用书名\n作者甲\n作者乙')
  })

  it('支持默认优先级：A || B && C', () => {
    const rule = 'class.fake-title@text || class.cat1@text && class.cat2@text'
    const result = evaluateRuleString(html, rule)
    expect(result).toBe('玄幻\n修真')
  })

  it('支持嵌套组合与交织：A %% (B || C)', () => {
    const listHtml = `
      <ul class="col-a"><li>A1</li><li>A2</li></ul>
      <ul class="col-b"><li>B1</li><li>B2</li></ul>
    `
    const rule = 'class.col-a@tag.li@text %% (class.col-fake@tag.li@text || class.col-b@tag.li@text)'
    const result = evaluateRuleList(listHtml, rule)
    expect(result).toEqual(['A1', 'B1', 'A2', 'B2'])
  })
})

describe('G2: 跨语法链式管道', () => {
  it('支持 CSS -> XPath 跨语法管道流转', () => {
    const html = `
      <div class="book-card">
        <a href="/book/101">第一本</a>
      </div>
      <div class="book-card">
        <a href="/book/102">第二本</a>
      </div>
    `
    const rule = '@CSS:.book-card@XPath:.//a/@href'
    const result = evaluateRuleList(html, rule)
    expect(result).toEqual(['/book/101', '/book/102'])
  })

  it('支持 JSON -> JSoup 跨语法管道流转', () => {
    const json = JSON.stringify({
      data: {
        htmls: [
          '<div class="inner"><p class="txt">段落一</p></div>',
          '<div class="inner"><p class="txt">段落二</p></div>',
        ],
      },
    })
    const rule = '@Json:$.data.htmls[*]@class.inner@tag.p@text'
    const result = evaluateRuleList(json, rule)
    expect(result).toEqual(['段落一', '段落二'])
  })

  it('支持 CSS -> JSoup -> 正则替换流水线', () => {
    const html = `
      <div class="container">
        <p class="chapter">第10章 终极对决</p>
        <p class="chapter">第11章 飞升成仙</p>
      </div>
    `
    const rule = '@CSS:.container@tag.p@text##^第(\\d+)章\\s*(.*)$##[$1] $2'
    const result = evaluateRuleList(html, rule)
    expect(result).toEqual(['[10] 终极对决', '[11] 飞升成仙'])
  })

  it('支持跨语法异步 JS 流水线变换', async () => {
    const html = `
      <div class="box">
        <a href="/read/1">章节一</a>
        <a href="/read/2">章节二</a>
      </div>
    `
    const runner: RuleScriptRunner = {
      javascript: async (_code, _context, input) => {
        const arr = Array.isArray(input) ? input : [input]
        return arr.map(item => `https://example.com${item}`)
      },
      webJavascript: async () => '',
    }
    const rule = '@CSS:.box@XPath:.//a/@href@js:result'
    const result = await evaluateRuleListAsync(html, rule, { compatibilityMode: 'legado' }, runner)
    expect(result).toEqual(['https://example.com/read/1', 'https://example.com/read/2'])
  })
})
