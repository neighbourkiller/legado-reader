import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import {
  buildBookTxtFileName,
  createBatchNovelZip,
  generateBookTxtContent,
  sanitizeFileName,
} from './exportNovel'
import { serializeOnlineChapterPayload } from '@/source/engine/ChapterPayload'
import type { StoredChapterContent } from '@/storage/types'

describe('exportNovel utils', () => {
  describe('sanitizeFileName', () => {
    it('should replace invalid path characters with underscore', () => {
      expect(sanitizeFileName('书名:测试/分卷?*<>|"')).toBe('书名_测试_分卷______')
      expect(sanitizeFileName('  普通 书名 \n\t ')).toBe('普通 书名')
      expect(sanitizeFileName('   ')).toBe('未命名')
    })
  })

  describe('buildBookTxtFileName', () => {
    it('should generate formatted txt filename with author', () => {
      expect(buildBookTxtFileName('斗破苍穹', '天蚕土豆')).toBe('斗破苍穹 - 天蚕土豆.txt')
    })

    it('should omit author if unknown or empty', () => {
      expect(buildBookTxtFileName('完美世界', '')).toBe('完美世界.txt')
      expect(buildBookTxtFileName('完美世界', '佚名')).toBe('完美世界.txt')
      expect(buildBookTxtFileName('完美世界', '未知作者')).toBe('完美世界.txt')
    })
  })

  describe('generateBookTxtContent', () => {
    it('should sort chapters by chapterIndex and format book text', () => {
      const meta = {
        name: '诛仙',
        author: '萧鼎',
        intro: '这世间本是没有什么神仙的...',
      }

      const chapters: StoredChapterContent[] = [
        {
          key: 'book1:1',
          bookId: 'book1',
          chapterIndex: 1,
          title: '第二章 迷局',
          content: '草庙村发生惨变。',
          downloadedAt: 2,
        },
        {
          key: 'book1:0',
          bookId: 'book1',
          chapterIndex: 0,
          title: '第一章 青云',
          content: '时间一晃而过。',
          downloadedAt: 1,
        },
      ]

      const content = generateBookTxtContent(meta, chapters)

      expect(content).toContain('《诛仙》')
      expect(content).toContain('作者：萧鼎')
      expect(content).toContain('【内容简介】\n这世间本是没有什么神仙的...')
      expect(content).toContain('==================================================')

      // 验证顺序：第一章应在第二章之前
      const idx1 = content.indexOf('第一章 青云')
      const idx2 = content.indexOf('第二章 迷局')
      expect(idx1).toBeGreaterThan(0)
      expect(idx2).toBeGreaterThan(idx1)
      expect(content).toContain('时间一晃而过。')
      expect(content).toContain('草庙村发生惨变。')
    })

    it('should handle serialized online chapter payload (text & images)', () => {
      const meta = { name: '测试漫画' }
      const textChapterPayload = serializeOnlineChapterPayload({
        type: 'text',
        text: '这是解包后的正文段落。',
      })
      const imageChapterPayload = serializeOnlineChapterPayload({
        type: 'images',
        images: [
          { url: 'https://example.com/1.jpg', index: 0 },
          { url: 'https://example.com/2.jpg', index: 1 },
        ],
        sourceUrl: 'https://example.com',
      })

      const chapters: StoredChapterContent[] = [
        {
          key: 'comic:0',
          bookId: 'comic',
          chapterIndex: 0,
          title: '序章 介绍',
          content: textChapterPayload,
          downloadedAt: 1,
        },
        {
          key: 'comic:1',
          bookId: 'comic',
          chapterIndex: 1,
          title: '第一话 启程',
          content: imageChapterPayload,
          downloadedAt: 2,
        },
      ]

      const content = generateBookTxtContent(meta, chapters)
      expect(content).toContain('这是解包后的正文段落。')
      expect(content).toContain('[图片章节，共 2 张图片]')
    })
  })

  describe('createBatchNovelZip', () => {
    it('should package multiple novels into a zip archive with disambiguated filenames', async () => {
      const items = [
        { fileName: '武动乾坤 - 天蚕土豆.txt', content: '林动的故事' },
        { fileName: '武动乾坤 - 天蚕土豆.txt', content: '同名书籍重名处理' },
        { fileName: '大奉打更人', content: '许七安的故事' },
      ]

      const zipBytes = await createBatchNovelZip(items)
      expect(zipBytes).toBeInstanceOf(Uint8Array)
      expect(zipBytes.length).toBeGreaterThan(0)

      const zip = await JSZip.loadAsync(zipBytes)
      const fileNames = Object.keys(zip.files)
      expect(fileNames).toContain('武动乾坤 - 天蚕土豆.txt')
      expect(fileNames).toContain('武动乾坤 - 天蚕土豆 (2).txt')
      expect(fileNames).toContain('大奉打更人.txt')

      const content1 = await zip.file('武动乾坤 - 天蚕土豆.txt')?.async('string')
      expect(content1).toBe('\ufeff林动的故事')
    })
  })
})
