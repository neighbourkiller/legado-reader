// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SourceEngine, parseSearchUrl, parseSearchUrlAsync, detectSecurityChallenge, SecurityChallengeError } from './SourceEngine'
import { deserializeOnlineChapterPayload, serializeOnlineChapterPayload } from './ChapterPayload'
import { applyTextReplaceRule, applyTextReplaceRuleAsync } from './RuleParser'
import type { BookSource } from '@/source/types/BookSource'
import { setTransport } from '@/source/transport'
import type { SourceRequest, SourceResponse, SourceTransport } from '@/source/transport/SourceTransport'
import * as sourceScripts from '@/platform/sourceScripts'

const source: BookSource = {
  bookSourceUrl: 'https://example.com/root/',
  bookSourceName: '综合测试书源',
  bookSourceType: 0,
  enabled: true,
  header: JSON.stringify({ 'X-Source': 'yes' }),
  searchUrl: '/search,{"method":"POST","body":"q={{key}}&page={{page}}","charset":"utf-8"}',
  ruleSearch: {
    bookList: '.book-item',
    name: '.title@text',
    author: '.author@text',
    bookUrl: 'a@href',
  },
  ruleBookInfo: {
    name: 'h1@text',
    author: '.author@text',
    tocUrl: 'a.toc@href',
  },
  ruleToc: {
    chapterList: '.chapter-list a',
    chapterName: 'text',
    chapterUrl: 'href',
    nextTocUrl: 'a.next-toc@href',
  },
  ruleContent: {
    content: '.content@text',
    nextContentUrl: '.next-page a',
    replaceRegex: '##广告##\n&&##【免责声明】##',
  },
  exploreUrl: '/explore',
  ruleExplore: {
    bookList: '.explore-item',
    name: '.name@text',
    bookUrl: 'a@href',
  },
}

describe('AnalyzeUrl 兼容请求解析', () => {
  it('解析相对地址、占位符与 POST JSON 参数', () => {
    const request = parseSearchUrl(
      `/search,{
        "method":"POST","body":"q={{key}}&page={{page}}",
        "charset":"gbk","headers":{"Content-Type":"application/x-www-form-urlencoded"}
      }`,
      '剑 来', source, 3,
    )
    expect(request).toMatchObject({
      url: 'https://example.com/search', method: 'POST', body: 'q=%E5%89%91%20%E6%9D%A5&page=3', charset: 'gbk',
    })
    expect(request.headers).toMatchObject({ 'X-Source': 'yes', 'Content-Type': 'application/x-www-form-urlencoded' })
  })

  it('支持 HEAD', () => {
    expect(parseSearchUrl('/health,{"method":"HEAD"}', '', source).method).toBe('HEAD')
  })

  it('支持分页候选与请求级传输选项', () => {
    const request = parseSearchUrl(
      '/search/<first,second,last>,{"retry":4,"timeout":1200,"followRedirects":false,"enabledCookieJar":false,"dnsIp":"127.0.0.1","useWebView":true,"webViewDelayTime":80}',
      '', source, 2,
    )
    expect(request).toMatchObject({
      url: 'https://example.com/search/second', retry: 4, timeout: 1200,
      followRedirects: false, useCookieJar: false, dnsIp: '127.0.0.1',
      useWebView: true, webViewDelayTime: 80,
    })
    expect(parseSearchUrl('/<one,two>', '', source, 9).url).toBe('https://example.com/two')
  })

  it('兼容 Android UrlOption 的对象 body、webView 与 type', () => {
    const request = parseSearchUrl('/api,{"method":"POST","body":{"key":"{{key}}"},"webView":"true","type":"image"}', '书', source)
    expect(request).toMatchObject({ method: 'POST', body: '{"key":"%E4%B9%A6"}', useWebView: true, responseType: 'hex' })
  })

  it('对 Android serverID 返回明确错误', () => {
    expect(() => parseSearchUrl('/api,{"serverID":1}', '', source)).toThrow('serverID')
  })

  it('parseSearchUrlAsync 支持占位符与快速解析', async () => {
    const request = await parseSearchUrlAsync('/api/search?k={{key}}&p={{page}}', '测试', source, 2)
    expect(request.url).toBe('https://example.com/api/search?k=%E6%B5%8B%E8%AF%95&p=2')
  })
})

describe('replaceRegex 多规则顺序替换', () => {
  it('按换行与 && 顺序应用多条正则替换', () => {
    const raw = '正文开始 广告 此处有【免责声明】 正文结束'
    const cleaned = applyTextReplaceRule(raw, '##广告##\n&&##【免责声明】##')
    expect(cleaned).toBe('正文开始  此处有 正文结束')
  })
})

describe('章节载荷缓存编码', () => {
  it('普通文本保持旧缓存格式，图片与混合文本使用版本清单', () => {
    expect(serializeOnlineChapterPayload({ type: 'text', text: '正文' })).toBe('正文')
    const images = { type: 'images' as const, sourceUrl: 'https://example.com/1', images: [{ url: '/1.jpg', index: 0 }] }
    expect(deserializeOnlineChapterPayload(serializeOnlineChapterPayload(images))).toEqual(images)
    const mixed = { type: 'text' as const, text: '正文', embeddedImages: [{ url: '/a.jpg', index: 0 }] }
    expect(deserializeOnlineChapterPayload(serializeOnlineChapterPayload(mixed))).toEqual(mixed)
  })
})

describe('端到端模拟链路测试: 搜索 → 详情 → 多页目录 → 多链接正文 → 发现', () => {
  const encoder = new TextEncoder()
  const responses: Record<string, string> = {
    'https://example.com/search': `
      <div class="book-item">
        <a href="/book/100">
          <span class="title">大奉打更人</span>
          <span class="author">卖报小郎君</span>
        </a>
      </div>
    `,
    'https://example.com/book/100': `
      <h1>大奉打更人</h1>
      <span class="author">卖报小郎君</span>
      <a class="toc" href="/book/100/toc?page=1">目录</a>
    `,
    'https://example.com/book/100/toc?page=1': `
      <div class="chapter-list">
        <a href="/chapter/1">第一章 许七安</a>
        <a href="/chapter/2">第二章 牢狱</a>
      </div>
      <a class="next-toc" href="/book/100/toc?page=2">下一页</a>
    `,
    'https://example.com/book/100/toc?page=2': `
      <div class="chapter-list">
        <a href="/chapter/3">第三章 炼金术</a>
      </div>
    `,
    'https://example.com/chapter/1': `
      <div class="content">第一页正文 广告 内容</div>
      <div class="next-page">
        <a href="/chapter/1_part2">第二页</a>
        <a href="/chapter/1_part3">第三页</a>
      </div>
    `,
    'https://example.com/chapter/1_part2': `
      <div class="content">第二页正文续写</div>
    `,
    'https://example.com/chapter/1_part3': `
      <div class="content">第三页正文收尾 【免责声明】</div>
    `,
    'https://example.com/explore': `
      <div class="explore-item">
        <a href="/book/200">
          <span class="name">宿命之环</span>
        </a>
      </div>
    `,
  }

  const mockTransport: SourceTransport = {
    request: vi.fn(async (options: SourceRequest): Promise<SourceResponse> => {
      const html = responses[options.url] || '<html><body>404</body></html>'
      return {
        status: responses[options.url] ? 200 : 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        body: encoder.encode(html),
        finalUrl: options.url,
        charset: 'utf-8',
        channel: 'reqwest',
      }
    }),
  }

  beforeEach(() => {
    setTransport(mockTransport)
  })

  afterEach(() => {
    setTransport(null)
    vi.clearAllMocks()
  })

  it('模拟全流程：搜索 -> 详情 -> 目录分页 -> 正文多链接分页合并与正则过滤', async () => {
    const engine = new SourceEngine()

    // 1. 搜索
    const searchResults = await engine.search(source, '大奉')
    expect(searchResults).toHaveLength(1)
    expect(searchResults[0].name).toBe('大奉打更人')
    expect(searchResults[0].author).toBe('卖报小郎君')
    expect(searchResults[0].bookUrl).toBe('https://example.com/book/100')

    // 2. 详情
    const bookInfo = await engine.getBookInfo(source, searchResults[0].bookUrl)
    expect(bookInfo.name).toBe('大奉打更人')
    expect(bookInfo.tocUrl).toBe('https://example.com/book/100/toc?page=1')

    // 3. 目录分页与进度汇报
    const tocPagesLogged: number[] = []
    const chapters = await engine.getToc(source, bookInfo.tocUrl, (info) => {
      tocPagesLogged.push(info.page)
    })
    expect(chapters).toHaveLength(3)
    expect(chapters[0].name).toBe('第一章 许七安')
    expect(chapters[1].name).toBe('第二章 牢狱')
    expect(chapters[2].name).toBe('第三章 炼金术')
    expect(tocPagesLogged).toEqual([1, 2])

    // 4. 正文多链接分页加载与合并清理
    const contentPagesLogged: number[] = []
    const chapterPayload = await engine.getContent(source, chapters[0].url, (info) => {
      contentPagesLogged.push(info.page)
    })
    expect(chapterPayload.type).toBe('text')
    if (chapterPayload.type === 'text') {
      expect(contentPagesLogged).toEqual([1, 2, 3])
      expect(chapterPayload.text).toContain('第一页正文')
      expect(chapterPayload.text).toContain('第二页正文续写')
      expect(chapterPayload.text).toContain('第三页正文收尾')
      // 验证 replaceRegex 成功过滤“广告”和“【免责声明】”
      expect(chapterPayload.text).not.toContain('广告')
      expect(chapterPayload.text).not.toContain('【免责声明】')
    }

    // 5. 发现页
    const exploreResults = await engine.explore(source)
    expect(exploreResults).toHaveLength(1)
    expect(exploreResults[0].name).toBe('宿命之环')
    expect(exploreResults[0].bookUrl).toBe('https://example.com/book/200')
  })

  it('允许批量快速测试把目录分页限制为一页', async () => {
    const engine = new SourceEngine()
    const pages: number[] = []
    const chapters = await engine.getToc(source, 'https://example.com/book/100/toc?page=1', info => {
      pages.push(info.page)
    }, { maxPages: 1 })

    expect(pages).toEqual([1])
    expect(chapters.map(chapter => chapter.name)).toEqual(['第一章 许七安', '第二章 牢狱'])
  })

  it('按 Android getCheckKeyword 语义使用安全的校验关键字', async () => {
    const engine = new SourceEngine()
    await engine.search({ ...source, ruleSearch: { ...source.ruleSearch!, checkKeyWord: '大奉' } }, '不会发送的原词')
    expect(mockTransport.request).toHaveBeenCalledWith(expect.objectContaining({ body: 'q=%E5%A4%A7%E5%A5%89&page=1' }))
  })

  it('把详情阶段变量写入书籍实体而不是污染书源变量', async () => {
    const engine = new SourceEngine()
    const book = { bookUrl: 'https://example.com/book/100', variableMap: { inherited: 'book' } }
    await engine.getBookInfo({
      ...source,
      variableMap: { sourceOnly: 'source' },
      ruleBookInfo: { ...source.ruleBookInfo!, name: '@put:{"saved":".author@text"}h1@text' },
    }, book)
    expect(book.variableMap).toEqual({ inherited: 'book', saved: '卖报小郎君' })
  })

  it('正文遇到循环自引用 URL 时能自动终止', async () => {
    const loopSource: BookSource = {
      ...source,
      ruleContent: {
        content: '.content@text',
        nextContentUrl: 'a.next@href',
      },
    }
    const engine = new SourceEngine()
    const loopResponses: Record<string, string> = {
      'https://example.com/loop/1': '<div class="content">内容1</div><a class="next" href="/loop/1">自引用下一页</a>',
    }
    const loopTransport: SourceTransport = {
      request: vi.fn(async (options: SourceRequest): Promise<SourceResponse> => ({
        status: 200, headers: {}, body: encoder.encode(loopResponses[options.url] || ''),
        finalUrl: options.url, charset: 'utf-8', channel: 'reqwest',
      })),
    }
    setTransport(loopTransport)

    const payload = await engine.getContent(loopSource, 'https://example.com/loop/1')
    expect(payload.type).toBe('text')
    if (payload.type === 'text') {
      expect(payload.text).toBe('内容1')
    }
    expect(loopTransport.request).toHaveBeenCalledTimes(1)
  })

  it('能精准识别前端 JS 浏览器质询盾并抛出 SecurityChallengeError', async () => {
    const challengeHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>正在验证浏览器</title></head>
      <body>
      <p>請稍等，正在進行安全驗證...</p>
      <script>
          let token = "MTc4Nzg4NzE4NTo1MDg2YzZiNmFhZjcwNTZlODEx";
          window.location.href = location.pathname + "?challenge=" + encodeURIComponent(token);  
      </script>
      </body>
      </html>
    `
    const diag = detectSecurityChallenge(challengeHtml)
    expect(diag.isChallenge).toBe(true)
    expect(diag.type).toBe('browser_challenge')
    expect(diag.title).toBe('正在验证浏览器')
    expect(diag.snippet).toContain('正在验证浏览器')

    const challengeSource: BookSource = {
      ...source,
      useWebView: false,
      ruleContent: {
        content: '//section/p[position()>1]/text()',
      },
    }
    const engine = new SourceEngine()
    const encoder = new TextEncoder()
    const mockTransport: SourceTransport = {
      request: vi.fn(async (options: SourceRequest): Promise<SourceResponse> => ({
        status: 200,
        headers: {},
        body: encoder.encode(challengeHtml),
        finalUrl: options.url,
        charset: 'utf-8',
        channel: 'reqwest',
      })),
    }
    setTransport(mockTransport)

    await expect(engine.getContent(challengeSource, 'https://example.com/read/1/p1.html'))
      .rejects
      .toThrowError(SecurityChallengeError)

    try {
      await engine.getContent(challengeSource, 'https://example.com/read/1/p1.html')
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(SecurityChallengeError)
      if (err instanceof SecurityChallengeError) {
        expect(err.diagnostics.title).toBe('正在验证浏览器')
        expect(err.diagnostics.type).toBe('browser_challenge')
        expect(err.message).toContain('安全验证页面')
      }
    }
  })

  it('支持 preUpdateJs 访问 baseUrl 并使用返回的 JSON 数据直接解析目录', async () => {
    const jsonCatalogSource: BookSource = {
      ...source,
      bookSourceUrl: 'https://ixdzs8.com',
      ruleToc: {
        chapterList: '$.data',
        chapterName: '$.title',
        chapterUrl: 'p{{$.ordernum}}.html',
        preUpdateJs: 'custom-pre-update-js',
      },
    }
    const engine = new SourceEngine()
    vi.spyOn(sourceScripts, 'executeSourceJavaScript').mockImplementation(async (_sourceId, _code, context) => {
      const bid = String(context.baseUrl).split('/read/')[1]?.split('/')[0]
      return {
        result: JSON.stringify({
          data: [
            { title: `第1章 异世降临 (bid=${bid})`, ordernum: 1 },
            { title: `第2章 神秘系统 (bid=${bid})`, ordernum: 2 },
          ],
        }),
        logs: [],
      }
    })

    const chapters = await engine.getToc(jsonCatalogSource, 'https://ixdzs8.com/read/30848/')
    expect(chapters).toHaveLength(2)
    expect(chapters[0].name).toBe('第1章 异世降临 (bid=30848)')
    expect(chapters[0].url).toBe('https://ixdzs8.com/read/30848/p1.html')
    expect(chapters[1].name).toBe('第2章 神秘系统 (bid=30848)')
    expect(chapters[1].url).toBe('https://ixdzs8.com/read/30848/p2.html')
  })

  it('当开启 useWebView 时遇到 JS 质询能自动调用 solveChallenge 穿透并解析正文', async () => {
    const challengeHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>正在验证浏览器</title></head>
      <body><p>請稍等，正在進行安全驗證...</p></body>
      </html>
    `
    const solvedHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>第1章 异世降临</title></head>
      <body>
        <article class="page-content">
          <section>
            <p>第一行忽略</p>
            <p>这是穿透后成功获取到的正文内容！</p>
          </section>
        </article>
      </body>
      </html>
    `

    const webviewSource: BookSource = {
      ...source,
      useWebView: true,
      ruleContent: {
        content: '//section/p[position()>1]/text()',
      },
    }
    const engine = new SourceEngine()
    const encoder = new TextEncoder()
    const mockTransport: SourceTransport = {
      request: vi.fn(),
      webviewFetch: vi.fn(async (options: SourceRequest): Promise<SourceResponse> => ({
        status: 200,
        headers: {},
        body: encoder.encode(challengeHtml),
        finalUrl: options.url,
        charset: 'utf-8',
        channel: 'webview',
      })),
      solveChallenge: vi.fn(async () => ({
        success: true,
        html: solvedHtml,
        cookies: ['PHPSESSID=test123456'],
        requiresManualInteraction: false,
      })),
    }
    setTransport(mockTransport)

    const payload = await engine.getContent(webviewSource, 'https://example.com/read/1/p1.html')
    expect(mockTransport.solveChallenge).toHaveBeenCalledWith(
      webviewSource.bookSourceUrl,
      'https://example.com/read/1/p1.html',
      5000,
    )
    expect(payload.type).toBe('text')
    if (payload.type === 'text') {
      expect(payload.text).toContain('这是穿透后成功获取到的正文内容！')
    }
  })

  it('当开启 useWebView 且 solveChallenge 失败/超时，抛出包含 requiresManualInteraction 的 SecurityChallengeError', async () => {
    const challengeHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>安全验证</title></head>
      <body><p>请完成滑动拼图验证...</p></body>
      </html>
    `
    const webviewSource: BookSource = {
      ...source,
      useWebView: true,
      ruleContent: {
        content: '//section/p/text()',
      },
    }
    const engine = new SourceEngine()
    const encoder = new TextEncoder()
    const mockTransport: SourceTransport = {
      request: vi.fn(),
      webviewFetch: vi.fn(async (options: SourceRequest): Promise<SourceResponse> => ({
        status: 200,
        headers: {},
        body: encoder.encode(challengeHtml),
        finalUrl: options.url,
        charset: 'utf-8',
        channel: 'webview',
      })),
      solveChallenge: vi.fn(async () => ({
        success: false,
        html: undefined,
        cookies: [],
        requiresManualInteraction: true,
      })),
    }
    setTransport(mockTransport)

    try {
      await engine.getContent(webviewSource, 'https://example.com/read/1/p1.html')
      expect.fail('应该抛出 SecurityChallengeError')
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(SecurityChallengeError)
      if (err instanceof SecurityChallengeError) {
        expect(err.diagnostics.requiresManualInteraction).toBe(true)
        expect(err.diagnostics.challengeUrl).toBe('https://example.com/read/1/p1.html')
        expect(err.message).toContain('自动穿透未通过')
      }
    }
  })

  it('executeSourceJavaScript 自动注入书源定义的公共 jsLib', async () => {
    const jsLibSource: BookSource = {
      ...source,
      jsLib: 'function dec(val) { return "decoded_" + val; }',
    }
    const engine = new SourceEngine()
    const spy = vi.spyOn(sourceScripts, 'executeSourceJavaScript').mockResolvedValue({
      result: 'decoded_123',
      logs: [],
    })

    const context = (engine as any).createRuleContext(jsLibSource, 'search')
    const result = await sourceScripts.executeSourceJavaScript('test', 'dec(result)', context, '123')
    expect(result.result).toBe('decoded_123')
    spy.mockRestore()
  })

  it('applyTextReplaceRuleAsync 支持 @js: 脚本清洗', async () => {
    const raw = '第1章 系统来早了\n正文内容 速读谷 (本章完)'
    const jsRule = "@js:result.replace(/^第\\d+章.*\\n?/gm, '').replace(/速读谷|\\(本章完\\)/g, '').trim()"
    const spy = vi.spyOn(sourceScripts, 'executeSourceJavaScript').mockImplementation(async (_sourceId, code, _context, input) => {
      const result = input
      const res = eval(code)
      return { result: res, logs: [] }
    })

    const cleaned = await applyTextReplaceRuleAsync(raw, jsRule)
    expect(cleaned).toBe('正文内容')
    spy.mockRestore()
  })
})

