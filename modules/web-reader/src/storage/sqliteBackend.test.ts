import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredBook } from '@/parsers/types'
import {
  exportSnapshotViaSession,
  getBook,
  getCachedDeviceId,
  importSnapshotViaStaging,
  saveBook,
  setCachedDeviceId,
} from './sqliteBackend'
import { StorageError } from './types'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'

describe('sqliteBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setCachedDeviceId('test-device-1')
  })

  it('saveBook 会使用小端 4 字节协议将 JSON 和二进制流打包', async () => {
    const mockInvoke = vi.mocked(invoke)
    mockInvoke.mockResolvedValueOnce(undefined)

    const fileContent = new TextEncoder().encode('Hello World')
    const book: StoredBook = {
      meta: {
        id: 'book-1',
        name: '测试书籍',
        author: '作者',
        format: 'txt',
        totalChapters: 1,
        currentChapter: 0,
        currentProgress: 0,
        lastReadTime: 123456789,
      },
      chapters: [{ index: 0, title: '第一章' }],
      fileData: fileContent.buffer,
    }

    await saveBook(book)

    expect(mockInvoke).toHaveBeenCalledTimes(1)
    const [command, payload] = mockInvoke.mock.calls[0]!
    expect(command).toBe('storage_save_book')
    expect(payload).toBeInstanceOf(Uint8Array)

    const buffer = payload as Uint8Array
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    const jsonLen = view.getUint32(0, true)
    expect(jsonLen).toBeGreaterThan(0)

    const jsonStr = new TextDecoder().decode(buffer.slice(4, 4 + jsonLen))
    const parsedJson = JSON.parse(jsonStr)
    expect(parsedJson.meta.id).toBe('book-1')
    expect(parsedJson.hasFileData).toBe(true)

    const fileBytes = buffer.slice(4 + jsonLen)
    expect(new TextDecoder().decode(fileBytes)).toBe('Hello World')
  })

  it('getBook 读取有文件的书籍时会二次按需调用 raw IPC 获取 ArrayBuffer', async () => {
    const mockInvoke = vi.mocked(invoke)
    mockInvoke.mockImplementation(async (command: string, args?: any) => {
      if (command === 'storage_get_book_record') {
        return {
          meta: {
            id: 'book-2',
            name: '书籍2',
            author: '作者2',
            format: 'epub',
            totalChapters: 2,
            currentChapter: 0,
            currentProgress: 0,
            lastReadTime: 0,
          },
          chapters: [],
          hasFileData: true,
          fileSize: 5,
        }
      }
      if (command === 'storage_get_book_file') {
        return new TextEncoder().encode('EPUB!').buffer
      }
      return null
    })

    const book = await getBook('book-2')
    expect(book).toBeDefined()
    expect(book?.meta.name).toBe('书籍2')
    expect(book?.fileData).toBeDefined()
    expect(new TextDecoder().decode(book!.fileData!)).toBe('EPUB!')
    expect(mockInvoke).toHaveBeenCalledWith('storage_get_book_record', { id: 'book-2' })
    expect(mockInvoke).toHaveBeenCalledWith('storage_get_book_file', { id: 'book-2' })
  })

  it('exportSnapshotViaSession 正确执行生命周期并在 finally 释放 session', async () => {
    const mockInvoke = vi.mocked(invoke)
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === 'storage_backup_export_begin') return 'exp_test_token'
      if (command === 'storage_backup_export_read_store') return []
      if (command === 'storage_backup_export_read_app_preferences') return { theme: 'dark' }
      if (command === 'storage_backup_export_end') return undefined
      return null
    })

    const session = await exportSnapshotViaSession()
    expect(session.snapshot).toBeDefined()
    expect(session.preferences.theme).toBe('dark')

    await session.closeSession()
    expect(mockInvoke).toHaveBeenCalledWith('storage_backup_export_end', { token: 'exp_test_token' })
  })

  it('importSnapshotViaStaging 正确把 stores 和 raw BLOB 写入 staging 并提交', async () => {
    const mockInvoke = vi.mocked(invoke)
    mockInvoke.mockResolvedValue(undefined)
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'storage_staging_create') return 'stg_test_token'
      return undefined
    })

    const dummyFile = new TextEncoder().encode('dummy content')
    const bookFiles = new Map<string, ArrayBuffer>()
    bookFiles.set('book-1', dummyFile.buffer)

    await importSnapshotViaStaging(
      {
        books: [
          {
            meta: {
              id: 'book-1',
              name: '书1',
              author: '作1',
              format: 'txt',
              totalChapters: 1,
              currentChapter: 0,
              currentProgress: 0,
              lastReadTime: 0,
            },
            chapters: [],
          },
        ],
      },
      ['books'],
      { legado_theme: 'dark' },
      bookFiles,
    )

    expect(mockInvoke).toHaveBeenCalledWith('storage_staging_create')
    expect(mockInvoke).toHaveBeenCalledWith('storage_staging_write_store', expect.objectContaining({
      token: 'stg_test_token',
      storeName: 'books',
    }))
    expect(mockInvoke).toHaveBeenCalledWith('storage_staging_write_book_file', expect.any(Uint8Array))
    expect(mockInvoke).toHaveBeenCalledWith('storage_staging_commit', expect.objectContaining({
      token: 'stg_test_token',
      clearStores: ['books'],
      appPreferences: { legado_theme: 'dark' },
      expectedCounts: { books: 1 },
      expectedBookChecksums: expect.objectContaining({
        'book-1': expect.any(String),
      }),
    }))
  })

  it('importSnapshotViaStaging 失败时会触发 storage_staging_abort 清理临时资源', async () => {
    const mockInvoke = vi.mocked(invoke)
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'storage_staging_create') return 'stg_fail_token'
      if (cmd === 'storage_staging_write_store') throw new Error('磁盘写满')
      return undefined
    })

    await expect(
      importSnapshotViaStaging(
        { books: [{ meta: { id: 'b1' } as any, chapters: [] }] },
        ['books'],
      ),
    ).rejects.toThrow()

    expect(mockInvoke).toHaveBeenCalledWith('storage_staging_abort', {
      token: 'stg_fail_token',
    })
  })

  it('发生错误时抛出具有结构化信息的 StorageError', async () => {
    const mockInvoke = vi.mocked(invoke)
    mockInvoke.mockRejectedValueOnce({
      code: 'CONSTRAINT',
      operation: 'save_book',
      message: '主键冲突',
      entity: 'books',
    })

    await expect(
      saveBook({
        meta: {
          id: 'dup-id',
          name: '重复书',
          author: '作者',
          format: 'txt',
          totalChapters: 0,
          currentChapter: 0,
          currentProgress: 0,
          lastReadTime: 0,
        },
        chapters: [],
      }),
    ).rejects.toThrowError(StorageError)
  })

  it('桌面生产构建产物正确包含 SQLite storage_* 原生命令', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const distDir = path.resolve(__dirname, '../../dist/assets')
    if (!fs.existsSync(distDir)) {
      return
    }

    const files = fs.readdirSync(distDir).filter(f => f.endsWith('.js'))
    let hasStorageSaveBook = false
    let hasStorageStagingCommit = false

    for (const file of files) {
      const content = fs.readFileSync(path.join(distDir, file), 'utf-8')
      if (content.includes('storage_save_book')) {
        hasStorageSaveBook = true
      }
      if (content.includes('storage_staging_commit')) {
        hasStorageStagingCommit = true
      }
    }

    expect(hasStorageSaveBook).toBe(true)
    expect(hasStorageStagingCommit).toBe(true)
  })
})
