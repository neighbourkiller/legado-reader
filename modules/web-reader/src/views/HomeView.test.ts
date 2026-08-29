import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const homeView = readFileSync(resolve(__dirname, './HomeView.vue'), 'utf-8')

describe('主页订阅源说明', () => {
  it('按实际平台说明客户端类型与数据存储位置', () => {
    expect(homeView).toContain('v-if="platform.isDesktop"')
    expect(homeView).toContain('Tauri 桌面客户端')
    expect(homeView).toContain('本机 SQLite 与应用数据文件')
    expect(homeView).toContain('v-else class="dialog-desc"')
    expect(homeView).toContain('Web 纯前端阅读器')
    expect(homeView).toContain('本地浏览器 IndexedDB')
  })

  it('明确当前客户端均不支持 RSS 订阅源', () => {
    expect(homeView).toContain('当前客户端暂不支持订阅 RSS 资讯与网络内容流')
    expect(homeView).toContain('Legado Android 客户端')
  })
})
