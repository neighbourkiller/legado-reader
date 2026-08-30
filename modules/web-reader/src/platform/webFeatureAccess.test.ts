// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import router from '@/router'

function source(path: string): string {
  return readFileSync(resolve(__dirname, path), 'utf-8')
}

describe('Web 阅读器功能入口', () => {
  it('注册设置与本地书详情路由，但不注册书源网络页面', () => {
    expect(router.hasRoute('settings')).toBe(true)
    expect(router.hasRoute('settings-preferences')).toBe(true)
    expect(router.hasRoute('book-detail')).toBe(true)
    expect(router.hasRoute('book-sources')).toBe(false)
    expect(router.hasRoute('search')).toBe(false)
  })

  it('全局主页与设置入口不再受 desktop 条件限制', () => {
    const app = source('../App.vue')
    const settings = source('../views/SettingsView.vue')
    expect(app).toContain('<GlobalHomeButton />')
    expect(app).not.toContain('<GlobalHomeButton v-if="isDesktop" />')
    expect(app).toContain('<GlobalSettingsButton />')
    expect(app).not.toContain('<GlobalSettingsButton v-if="isDesktop" />')
    expect(source('../components/GlobalSettingsButton.vue')).toContain('!isBookSourcesRoute')
    expect(settings).toContain("{ key: 'backup', title: '备份与恢复'")
  })

  it('阅读标注、替换和阅读记录不再共用桌面详情开关', () => {
    const reader = source('../views/ReaderView.vue')
    expect(reader).not.toContain('supportsBookDetail')
    expect(reader).toContain('await loadCurrentBookHighlights()')
    expect(reader).toContain('replaceRules.value = await getAllReplaceRules()')
    expect(reader).toContain('await addReadingTime(currentBook.value, 0)')
    expect(reader).toContain('await copyTextToClipboard(text)')
  })

  it('Web 仅对本地书开放详情，文件面板保留 TXT 与 ZIP 下载降级', () => {
    const bookCard = source('../components/BookCard.vue')
    const fileManager = source('../components/settings/FileManagerPanel.vue')
    const exporters = source('./exportFiles.ts')

    expect(bookCard).toContain("props.book.format !== 'online'")
    expect(fileManager).toContain('v-if="platform.isDesktop" class="native-folder-action"')
    expect(fileManager).toContain('saveTextFile')
    expect(fileManager).toContain('saveZipFile')
    expect(exporters).toContain("a.download = defaultName")
  })

  it('Web 开放本地备份文件选择、下载和首次恢复引导', () => {
    const backupFiles = source('./backupFiles.ts')
    const backupPanel = source('../components/settings/BackupPanel.vue')
    const bookshelf = source('../views/BookshelfView.vue')

    expect(backupFiles).toContain("input.accept = '.zip,application/zip'")
    expect(backupFiles).toContain('return saveZipFile(bytes, defaultName)')
    expect(backupPanel).toContain('浏览器本地备份')
    expect(backupPanel).toContain('v-if="isDesktop" shadow="never" class="backup-card"')
    expect(bookshelf).toContain('platform.supportsLocalBackup')
  })
})
