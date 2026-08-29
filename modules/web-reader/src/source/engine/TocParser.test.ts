// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseToc } from './TocParser'
import { parseSearchResults } from './SearchParser'

describe('目录元素列表规则', () => {
  it('将链式规则末段 a 作为标签选择器，而不是 a 属性', async () => {
    const chapters = await parseToc(
      '<ul id="myList"><li><a href="/comic_details/1">第1话</a></li><li><a href="/comic_details/2">第2话</a></li></ul>',
      {
        chapterList: 'id.myList@li@a',
        chapterName: 'text',
        chapterUrl: 'href',
      },
      'https://example.com/comic_ls/10261',
    )

    expect(chapters).toEqual([
      { name: '第1话', url: 'https://example.com/comic_details/1', isVolume: false, isVip: false, isPay: false, updateTime: undefined, variableMap: undefined },
      { name: '第2话', url: 'https://example.com/comic_details/2', isVolume: false, isVip: false, isPay: false, updateTime: undefined, variableMap: undefined },
    ])
  })

  it('同样保留搜索列表的 getElements 语义', async () => {
    const results = await parseSearchResults(
      '<ul id="results"><li><a href="/book/1">书名甲</a></li></ul>',
      { bookList: 'id.results@li@a', name: 'text', bookUrl: 'href' },
      'https://example.com/search',
    )

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ name: '书名甲', bookUrl: 'https://example.com/book/1' })
  })
})
