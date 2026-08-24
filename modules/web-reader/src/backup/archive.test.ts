import 'fake-indexeddb/auto'
import JSZip from 'jszip'
import { beforeAll, describe, expect, it } from 'vitest'
import type { StoredBook } from '@/parsers/types'
import { DATABASE_STORE_NAMES, exportDatabaseSnapshot, importDatabaseSnapshot } from '@/storage/db'
import sourceFixture from '../../test-fixtures/android-compatible/bookSource.json'
import bookFixture from '../../test-fixtures/android-compatible/bookshelf.json'
import bookmarkFixture from '../../test-fixtures/android-compatible/bookmark.json'
import readRecordFixture from '../../test-fixtures/android-compatible/readRecord.json'
import {
  BACKED_UP_LOCAL_STORAGE_KEYS,
  createBackupArchive,
  inspectZipCentralDirectory,
  parseBackupArchive,
  restoreParsedBackup,
} from './archive'

class TestStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
}

const localBook: StoredBook = {
  meta: {
    id: 'local-fixture',
    name: '本地测试书',
    author: '桌面作者',
    format: 'txt',
    totalChapters: 1,
    currentChapter: 0,
    currentProgress: 100,
    lastReadTime: 1,
  },
  chapters: [{ index: 0, title: '第一章', startOffset: 0, endOffset: 9 }],
  fileData: new TextEncoder().encode('本地正文内容').buffer,
}

const onlineBook: StoredBook = {
  meta: {
    id: 'online-fixture',
    name: '网络测试书',
    author: '网络作者',
    format: 'online',
    totalChapters: 1,
    currentChapter: 0,
    currentProgress: 100,
    currentChapterPos: 0,
    lastReadTime: 2,
    sourceUrl: 'https://source.example.com',
    sourceName: '夹具书源',
    bookUrl: 'https://book.example.com/fixture',
    tocUrl: 'https://book.example.com/fixture/toc',
  },
  chapters: [{ index: 0, title: '第一章', href: 'https://book.example.com/fixture/1' }],
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new TestStorage(), configurable: true })
})

describe('Tauri 混合 ZIP', () => {
  it('主题模式、强调色和应用偏好都包含在备份范围内', () => {
    expect(BACKED_UP_LOCAL_STORAGE_KEYS).toEqual(expect.arrayContaining([
      'legado_app_settings',
      'legado_theme',
      'legado_theme_accent',
    ]))
  })

  it('完整保存 Android 标准文件、Tauri 快照和本地书二进制', async () => {
    await importDatabaseSnapshot({
      books: [localBook, onlineBook],
      bookSources: [{ bookSourceUrl: 'https://source.example.com', bookSourceName: '夹具书源' }],
      chapterContents: [{
        key: 'online-fixture:0',
        bookId: 'online-fixture',
        chapterIndex: 0,
        title: '第一章',
        content: '网络正文',
        downloadedAt: 1,
      }],
      bookmarks: [],
      readingRecords: [],
      settings: [],
      remoteBooks: [],
    }, [...DATABASE_STORE_NAMES])
    localStorage.setItem('legado_app_settings', '{"bookshelfClickAction":"reader"}')

    const created = await createBackupArchive('test-version')
    const names = inspectZipCentralDirectory(created.bytes).map(item => item.name)
    expect(names).toEqual(expect.arrayContaining([
      'bookSource.json',
      'bookshelf.json',
      'bookmark.json',
      'readRecord.json',
      'tauri/manifest.json',
      'tauri/data.json',
      'tauri/books/000000.txt',
    ]))

    const parsed = await parseBackupArchive(created.bytes)
    expect(parsed.preview.kind).toBe('tauri')
    expect(parsed.preview.counts.localBooks).toBe(1)
    expect(parsed.localBookFiles.size).toBe(1)

    await importDatabaseSnapshot({ books: [], bookSources: [] }, ['books', 'bookSources'])
    await restoreParsedBackup(parsed, 'overwrite')
    const restored = await exportDatabaseSnapshot()
    const books = restored.books as StoredBook[]
    expect(books).toHaveLength(2)
    const restoredFile = books.find(item => item.meta.id === 'local-fixture')?.fileData
    expect(restoredFile).toBeInstanceOf(ArrayBuffer)
    expect(new TextDecoder().decode(restoredFile as ArrayBuffer)).toBe('本地正文内容')
  })

  it('合并恢复保留快照外数据并按设备合并阅读时长', async () => {
    await importDatabaseSnapshot({
      books: [onlineBook],
      bookSources: [{ bookSourceUrl: 'https://source.example.com' }],
      readingRecords: [{
        bookId: onlineBook.meta.id,
        bookName: onlineBook.meta.name,
        bookAuthor: onlineBook.meta.author,
        readTime: 40,
        lastRead: 10,
        devices: { tauriA: { readTime: 40, lastRead: 10, author: onlineBook.meta.author } },
      }],
      settings: [],
      remoteBooks: [],
      chapterContents: [],
      bookmarks: [],
    }, [...DATABASE_STORE_NAMES])
    const parsed = await parseBackupArchive((await createBackupArchive()).bytes)

    await importDatabaseSnapshot({
      books: [localBook],
      bookSources: [{ bookSourceUrl: 'https://current-only.example.com' }],
      readingRecords: [{
        bookId: onlineBook.meta.id,
        bookName: onlineBook.meta.name,
        bookAuthor: onlineBook.meta.author,
        readTime: 60,
        lastRead: 20,
        devices: { androidA: { readTime: 60, lastRead: 20, author: onlineBook.meta.author } },
      }],
    })
    await restoreParsedBackup(parsed, 'merge')

    const snapshot = await exportDatabaseSnapshot()
    expect((snapshot.books as StoredBook[]).some(book => book.meta.id === localBook.meta.id)).toBe(true)
    expect((snapshot.bookSources as any[]).some(source =>
      source.bookSourceUrl === 'https://current-only.example.com',
    )).toBe(true)
    const record = (snapshot.readingRecords as any[])[0]
    expect(record.readTime).toBe(100)
    expect(Object.keys(record.devices).sort()).toEqual(['androidA', 'tauriA'])
  })

  it('拒绝路径穿越和损坏校验', async () => {
    const malicious = new JSZip()
    malicious.file('../bookSource.json', '[]')
    malicious.file('bookshelf.json', '[]')
    const maliciousBytes = await malicious.generateAsync({ type: 'uint8array' })
    expect(() => inspectZipCentralDirectory(maliciousBytes)).toThrow(/不安全路径/)

    const created = await createBackupArchive()
    const corrupted = new Uint8Array(created.bytes)
    const marker = new TextEncoder().encode('bookSource.json')
    const index = corrupted.findIndex((_, offset) => marker.every((byte, inner) => corrupted[offset + inner] === byte))
    expect(index).toBeGreaterThanOrEqual(0)
    // 改坏第一个本地文件头后的压缩数据；解析必须失败或触发 SHA-256 不匹配。
    corrupted[Math.min(corrupted.length - 1, index + marker.length + 8)]! ^= 0xff
    await expect(parseBackupArchive(corrupted)).rejects.toThrow()
  })

  it('拒绝大小写重复关键文件、超量条目和伪造解压大小', async () => {
    const duplicate = new JSZip()
    duplicate.file('bookSource.json', '[]')
    duplicate.file('booksource.json', '[]')
    const duplicateBytes = await duplicate.generateAsync({ type: 'uint8array' })
    expect(() => inspectZipCentralDirectory(duplicateBytes)).toThrow(/重复关键文件/)

    const excessive = new JSZip()
    for (let index = 0; index <= 10_000; index += 1) excessive.file(`items/${index}`, '')
    const excessiveBytes = await excessive.generateAsync({ type: 'uint8array', compression: 'STORE' })
    expect(() => inspectZipCentralDirectory(excessiveBytes)).toThrow(/超过 10000 个上限/)

    const oversized = new JSZip()
    oversized.file('bookSource.json', '[]')
    const oversizedBytes = await oversized.generateAsync({ type: 'uint8array', compression: 'STORE' })
    const centralOffset = oversizedBytes.findIndex((_, offset) =>
      oversizedBytes[offset] === 0x50 &&
      oversizedBytes[offset + 1] === 0x4b &&
      oversizedBytes[offset + 2] === 0x01 &&
      oversizedBytes[offset + 3] === 0x02,
    )
    expect(centralOffset).toBeGreaterThanOrEqual(0)
    new DataView(oversizedBytes.buffer).setUint32(centralOffset + 24, 512 * 1024 * 1024 + 1, true)
    expect(() => inspectZipCentralDirectory(oversizedBytes)).toThrow(/512 MiB/)
  })

  it('较新未知 Tauri 格式只开放 Android 共同数据并明确警告', async () => {
    const zip = new JSZip()
    zip.file('bookSource.json', '[]')
    zip.file('bookshelf.json', '[]')
    zip.file('bookmark.json', '[]')
    zip.file('readRecord.json', '[]')
    zip.file('tauri/manifest.json', JSON.stringify({
      format: 'legado-tauri-backup',
      version: 2,
      checksums: {},
    }))
    zip.file('tauri/data.json', JSON.stringify({ version: 2, database: { books: [localBook] } }))
    const parsed = await parseBackupArchive(await zip.generateAsync({ type: 'uint8array' }))
    expect(parsed.preview.kind).toBe('newer-tauri')
    expect(parsed.preview.canRestoreTauriData).toBe(false)
    expect(parsed.preview.warnings.join('')).toContain('仅可恢复安卓共同数据')
  })
})

describe('纯 Android 覆盖边界', () => {
  it('读取与 Android JVM 测试共用的四文件兼容夹具', async () => {
    const zip = new JSZip()
    zip.file('bookSource.json', JSON.stringify(sourceFixture))
    zip.file('bookshelf.json', JSON.stringify(bookFixture))
    zip.file('bookmark.json', JSON.stringify(bookmarkFixture))
    zip.file('readRecord.json', JSON.stringify(readRecordFixture))
    const parsed = await parseBackupArchive(await zip.generateAsync({ type: 'uint8array' }))
    expect(parsed.preview.kind).toBe('android')
    expect(parsed.preview.counts).toMatchObject({
      bookSources: 1,
      onlineBooks: 1,
      bookmarks: 1,
      readingRecords: 1,
    })
  })

  it('覆盖共同数据但保留 Tauri 本地书籍和专属设置', async () => {
    await importDatabaseSnapshot({
      books: [localBook, onlineBook],
      settings: [{ key: 'readSettings', fontSize: 20 }],
      bookSources: [{ bookSourceUrl: 'https://old.example.com' }],
      bookmarks: [],
      readingRecords: [],
    }, ['books', 'settings', 'bookSources', 'bookmarks', 'readingRecords'])

    const zip = new JSZip()
    zip.file('bookSource.json', JSON.stringify([{ bookSourceUrl: 'https://new.example.com' }]))
    zip.file('bookshelf.json', JSON.stringify([{
      bookUrl: 'https://new.example.com/book',
      origin: 'https://new.example.com',
      name: '安卓网络书',
      author: '安卓作者',
      durChapterIndex: 3,
    }]))
    zip.file('bookmark.json', '[]')
    zip.file('readRecord.json', JSON.stringify([{
      deviceId: 'android-device',
      bookName: '安卓网络书',
      author: '安卓作者',
      readTime: 100,
      lastRead: 50,
    }]))
    const parsed = await parseBackupArchive(await zip.generateAsync({ type: 'uint8array' }))
    await restoreParsedBackup(parsed, 'overwrite')

    const snapshot = await exportDatabaseSnapshot()
    const books = snapshot.books as StoredBook[]
    expect(books.some(item => item.meta.id === localBook.meta.id)).toBe(true)
    expect(books.some(item => item.meta.bookUrl === 'https://new.example.com/book')).toBe(true)
    expect(snapshot.settings).toEqual([{ key: 'readSettings', fontSize: 20 }])
    expect((snapshot.bookSources as any[]).map(item => item.bookSourceUrl)).toEqual(['https://new.example.com'])
  })
})
