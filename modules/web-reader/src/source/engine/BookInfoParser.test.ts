// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseBookInfo } from './BookInfoParser'

describe('书籍详情解析', () => {
  it('tocUrl 为空时使用详情页地址，不从推荐阅读猜测目录地址', async () => {
    const baseUrl = 'https://m.libahao2.com/book/11250358_449/'
    const html = `
      <h1>娱乐帝国系统</h1>
      <section class="recommendations">
        <a href="/book/241452_371048/">西游:开局给玉帝戴帽子最新章节目录</a>
      </section>
      <ul class="chapters">
        <li><a href="/book/11250358_449/1.html">第一章</a></li>
      </ul>
    `

    const info = await parseBookInfo(html, { tocUrl: '' }, baseUrl)

    expect(info.tocUrl).toBe(baseUrl)
  })

  it('保留书源显式解析出的目录地址', async () => {
    const info = await parseBookInfo(
      '<a class="toc" href="/book/1/chapters/">查看目录</a>',
      { tocUrl: '.toc@href' },
      'https://book.example.com/book/1/',
    )

    expect(info.tocUrl).toBe('https://book.example.com/book/1/chapters/')
  })

  it('显式目录规则未命中时同样回退到详情页地址', async () => {
    const baseUrl = 'https://book.example.com/book/1/'

    const info = await parseBookInfo('<h1>示例书籍</h1>', { tocUrl: '.missing@href' }, baseUrl)

    expect(info.tocUrl).toBe(baseUrl)
  })
})
