import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveMobileWebLayout } from '@/composables/useMobileWebLayout'

function source(path: string): string {
  return readFileSync(resolve(__dirname, path), 'utf-8')
}

describe('Web 手机端应用壳', () => {
  it('只在 Web 窄视口启用手机布局', () => {
    expect(resolveMobileWebLayout(false, true)).toBe(true)
    expect(resolveMobileWebLayout(false, false)).toBe(false)
    expect(resolveMobileWebLayout(true, true)).toBe(false)
  })

  it('仅为首页、书架与设置挂载三栏导航', () => {
    const app = source('../../App.vue')
    expect(app).toContain("new Set(['home', 'bookshelf', 'settings'])")
    expect(app).toContain('<MobilePrimaryNav v-if="showMobilePrimaryNav"')
    expect(app).toContain('<template v-else>')
    expect(app).not.toContain("new Set(['home', 'bookshelf', 'settings', 'reader'])")
  })

  it('手机首页复用原路由，书架支持接收搜索参数', () => {
    const home = source('../../views/HomeView.vue')
    const bookshelf = source('../../views/BookshelfView.vue')
    const settings = source('../../views/SettingsView.vue')
    expect(home).toContain('<MobileHomeDashboard v-if="isMobileWeb" />')
    expect(home).toContain('v-else\n    class="home-wrapper"')
    const mobileHome = source('./MobileHomeDashboard.vue')
    expect(mobileHome).toContain('<h2>最近阅读</h2>')
    expect(mobileHome).not.toContain('MobileShelfBookCard')
    expect(mobileHome).not.toContain('我的书架')
    expect(mobileHome).not.toContain('聚焦书架搜索')
    expect(mobileHome).not.toContain('mobile-home-dashboard__search')
    expect(mobileHome).not.toContain('搜索书架中的书籍')
    expect(bookshelf).toContain("typeof route.query.q === 'string'")
    expect(bookshelf).toContain("'mobile-layout': isMobileWeb")
    expect(bookshelf).toContain('<h1>书架</h1>')
    expect(bookshelf).toContain('aria-label="搜索书架"')
    expect(bookshelf).toContain('v-show="!isMobileWeb || isMobileSearchVisible"')
    expect(bookshelf).toContain('<div v-if="!isMobileWeb" class="bottom-wrapper">')
    expect(bookshelf).toContain('导入书籍')
    expect(bookshelf).not.toContain('传书 / 导入书籍')
    expect(settings).toContain("'mobile-layout': isMobileWeb")
    expect(settings).toContain('v-if="!isMobileWeb || !mobilePanelOpen"')
    expect(settings).toContain('v-if="!isMobileWeb || mobilePanelOpen"')
    expect(settings).toContain('class="mobile-panel-back"')
    expect(settings).toContain("query: { section: item.key }")
    expect(settings).toContain("document.querySelector<HTMLElement>('.app-content')?.scrollTo({ top: 0 })")
    expect(bookshelf).not.toContain(':global(.mobile-primary-shell)')
    expect(settings).not.toContain(':global(.mobile-primary-shell)')
  })

  it('底栏包含安全区并保证每项具备页面状态', () => {
    const nav = source('./MobilePrimaryNav.vue')
    expect(nav).toContain('env(safe-area-inset-bottom, 0px)')
    expect(nav).toContain(':aria-current="isActive(item) ? \'page\' : undefined"')
    expect(nav).toContain('min-height: 56px')
  })

  it('仅在手机 Web 环境将表格和卡片式内容面板切换为直角', () => {
    const app = source('../../App.vue')
    const mobileStyles = source('../../assets/styles/mobile-shell.css')
    expect(app).toContain("document.documentElement.classList.toggle('mobile-web', mobile)")
    expect(app).toContain("document.documentElement.classList.remove('mobile-web')")
    expect(mobileStyles).toContain('html.mobile-web .el-table,')
    expect(mobileStyles).toContain('html.mobile-web .el-table-v2,')
    expect(mobileStyles).toContain('html.mobile-web .audit-matrix,')
    expect(mobileStyles).toContain('html.mobile-web table {')
    expect(mobileStyles).toContain('html.mobile-web .el-button,')
    expect(mobileStyles).toContain('html.mobile-web .book-item-card,')
    expect(mobileStyles).toContain('html.mobile-web .recent-reading-card,')
    expect(mobileStyles).toContain('html.mobile-web .navigation-group,')
    expect(mobileStyles).toContain('html.mobile-web .preference-list,')
    expect(mobileStyles).toContain('border-radius: 0 !important;')
  })
})
