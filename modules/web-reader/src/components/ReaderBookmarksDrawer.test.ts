import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('阅读器书签管理抽屉', () => {
  it('提供当前页末增删、全书列表、跳转和单条删除入口', () => {
    const content = readFileSync(resolve(__dirname, './ReaderBookmarksDrawer.vue'), 'utf-8')

    expect(content).toContain('当前页末')
    expect(content).toContain('本书全部书签')
    expect(content).toContain("emit('toggleCurrent')")
    expect(content).toContain("emit('jump', bookmark)")
    expect(content).toContain("emit('delete', bookmark)")
    expect(content).toContain('currentPositionAvailable')
  })

  it('兼容深浅阅读主题、键盘焦点与减少动画偏好', () => {
    const content = readFileSync(resolve(__dirname, './ReaderBookmarksDrawer.vue'), 'utf-8')

    expect(content).toContain('html.dark .reader-bookmarks-drawer')
    expect(content).toContain('.bookmark-main:focus-visible')
    expect(content).toContain('@media (prefers-reduced-motion: reduce)')
    expect(content).toContain('bookmark-ribbon')
  })
})
