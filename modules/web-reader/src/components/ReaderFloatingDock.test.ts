import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

describe('阅读器沉浸式浮岛控制栏测试', () => {
  it('ReaderFloatingDock.vue 组件文件存在且包含高频控制与更多功能菜单', () => {
    const dockPath = resolve(__dirname, './ReaderFloatingDock.vue')
    expect(existsSync(dockPath)).toBe(true)

    const content = readFileSync(dockPath, 'utf-8')
    expect(content).toContain('reader-floating-dock')
    expect(content).toContain('backdrop-filter: blur(26px) saturate(145%)')
    expect(content).toContain('--dock-glass-background')
    expect(content).toContain('prefers-reduced-motion: reduce')
    expect(content).toContain(':inert="!visible"')
    expect(content).toContain('--reader-dock-height')
    expect(content).toContain("height?: number")
    expect(content).toContain('to-shelf')
    expect(content).toContain('toggle-catalog')
    expect(content).toContain('toggle-settings')
    expect(content).toContain('@click="emit(\'open-bookmarks-drawer\')"')
    expect(content).toContain('title="打开本书书签管理"')
    expect(content).not.toContain("'toggle-bookmark': []")
    expect(content).toContain('prev-chapter')
    expect(content).toContain('next-chapter')
    expect(content).toContain('el-dropdown')
  })

  it('IconPalette.vue 调色板图标组件存在且在控制栏中正确应用', () => {
    const palettePath = resolve(__dirname, './icons/IconPalette.vue')
    expect(existsSync(palettePath)).toBe(true)

    const paletteContent = readFileSync(palettePath, 'utf-8')
    expect(paletteContent).toContain('<svg')
    expect(paletteContent).toContain('icon-palette')

    const dockPath = resolve(__dirname, './ReaderFloatingDock.vue')
    const dockContent = readFileSync(dockPath, 'utf-8')
    expect(dockContent).toContain('IconPalette')
  })
})
