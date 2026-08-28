import { describe, it, expect } from 'vitest'
import { parseDebugInput, parseExploreUrlOptions } from './SourceDebugHelper'

describe('SourceDebugHelper', () => {
  describe('parseDebugInput', () => {
    it('should parse plain keyword for search debugging', () => {
      const res1 = parseDebugInput('系统')
      expect(res1.type).toBe('search')
      expect(res1.payload.keyword).toBe('系统')

      const res2 = parseDebugInput('  校园 都市  ')
      expect(res2.type).toBe('search')
      expect(res2.payload.keyword).toBe('校园 都市')
    })

    it('should parse http/https URLs as detail page debugging', () => {
      const res1 = parseDebugInput('https://m.qidian.com/book/1015609210')
      expect(res1.type).toBe('bookInfo')
      expect(res1.payload.bookUrl).toBe('https://m.qidian.com/book/1015609210')

      const res2 = parseDebugInput('http://example.com/novel/123.html')
      expect(res2.type).toBe('bookInfo')
      expect(res2.payload.bookUrl).toBe('http://example.com/novel/123.html')
    })

    it('should parse strings containing :: as explore page debugging', () => {
      const res1 = parseDebugInput('排行::/novel/rank')
      expect(res1.type).toBe('explore')
      expect(res1.payload.exploreName).toBe('排行')
      expect(res1.payload.exploreUrl).toBe('/novel/rank')

      const res2 = parseDebugInput('月票榜::https://www.qidian.com/rank/yuepiao?page={{page}}')
      expect(res2.type).toBe('explore')
      expect(res2.payload.exploreName).toBe('月票榜')
      expect(res2.payload.exploreUrl).toBe('https://www.qidian.com/rank/yuepiao?page={{page}}')
    })

    it('should parse strings starting with ++ as toc page debugging', () => {
      const res1 = parseDebugInput('++https://www.zhaishuyuan.com/read/30394')
      expect(res1.type).toBe('toc')
      expect(res1.payload.tocUrl).toBe('https://www.zhaishuyuan.com/read/30394')

      const res2 = parseDebugInput('++/read/30394')
      expect(res2.type).toBe('toc')
      expect(res2.payload.tocUrl).toBe('/read/30394')
    })

    it('should parse strings starting with -- as content page debugging', () => {
      const res1 = parseDebugInput('--https://www.zhaishuyuan.com/chapter/30394/20940996')
      expect(res1.type).toBe('content')
      expect(res1.payload.chapterUrl).toBe('https://www.zhaishuyuan.com/chapter/30394/20940996')

      const res2 = parseDebugInput('--/chapter/1/2')
      expect(res2.type).toBe('content')
      expect(res2.payload.chapterUrl).toBe('/chapter/1/2')
    })
  })

  describe('parseExploreUrlOptions', () => {
    it('should parse line-separated exploreUrls', () => {
      const raw = `
        玄幻::/category/xuanhuan
        都市::/category/dushi
        科幻::https://example.com/kehuan
      `
      const options = parseExploreUrlOptions(raw)
      expect(options).toHaveLength(3)
      expect(options[0]).toEqual({
        title: '玄幻',
        url: '/category/xuanhuan',
        fullKey: '玄幻::/category/xuanhuan',
      })
      expect(options[1]).toEqual({
        title: '都市',
        url: '/category/dushi',
        fullKey: '都市::/category/dushi',
      })
      expect(options[2]).toEqual({
        title: '科幻',
        url: 'https://example.com/kehuan',
        fullKey: '科幻::https://example.com/kehuan',
      })
    })

    it('should parse && separated exploreUrls', () => {
      const raw = '榜单::/rank&&推荐::/recom'
      const options = parseExploreUrlOptions(raw)
      expect(options).toHaveLength(2)
      expect(options[0].title).toBe('榜单')
      expect(options[1].title).toBe('推荐')
    })

    it('should parse JSON array exploreUrls', () => {
      const raw = JSON.stringify([
        { title: '热榜', url: '/rank/hot' },
        { name: '新书', path: '/rank/new' },
      ])
      const options = parseExploreUrlOptions(raw)
      expect(options).toHaveLength(2)
      expect(options[0]).toEqual({
        title: '热榜',
        url: '/rank/hot',
        fullKey: '热榜::/rank/hot',
      })
      expect(options[1]).toEqual({
        title: '新书',
        url: '/rank/new',
        fullKey: '新书::/rank/new',
      })
    })

    it('should return empty array for empty or invalid input', () => {
      expect(parseExploreUrlOptions('')).toEqual([])
      expect(parseExploreUrlOptions(undefined)).toEqual([])
      expect(parseExploreUrlOptions('   ')).toEqual([])
      expect(parseExploreUrlOptions('plain text without separator')).toEqual([])
    })
  })
})
