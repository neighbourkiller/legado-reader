import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

describe('主页图标与主页按钮测试', () => {
  it('home.svg 静态资源存在且具备合法的 SVG 与 currentColor 属性', () => {
    const svgPath = resolve(__dirname, '../assets/icons/home.svg')
    expect(existsSync(svgPath)).toBe(true)

    const content = readFileSync(svgPath, 'utf-8')
    expect(content).toContain('<svg')
    expect(content).toContain('viewBox="0 0 512 512"')
    expect(content).toContain('fill="currentColor"')
    expect(content).toContain('<path d="M 256.0 52.0')
  })

  it('IconHome.vue 组件文件存在且正确绑定属性与 currentColor', () => {
    const vuePath = resolve(__dirname, './icons/IconHome.vue')
    expect(existsSync(vuePath)).toBe(true)

    const content = readFileSync(vuePath, 'utf-8')
    expect(content).toContain('viewBox="0 0 512 512"')
    expect(content).toContain('fill="currentColor"')
    expect(content).toContain('class="icon-home"')
    expect(content).toContain(':width="size"')
    expect(content).toContain(':height="size"')
    expect(content).toContain('d="M 256.0 52.0')
  })

  it('GlobalHomeButton.vue 已替换为 IconHome 且配置深色模式与悬浮过渡样式', () => {
    const buttonPath = resolve(__dirname, './GlobalHomeButton.vue')
    expect(existsSync(buttonPath)).toBe(true)

    const content = readFileSync(buttonPath, 'utf-8')
    expect(content).toContain('<IconHome />')
    expect(content).not.toContain('<House />')
    expect(content).toContain("import IconHome from '@/components/icons/IconHome.vue'")
    expect(content).toContain(':global(html.dark) .global-home-button')
    expect(content).toContain('transform: translateY(-2px)')
  })
})
