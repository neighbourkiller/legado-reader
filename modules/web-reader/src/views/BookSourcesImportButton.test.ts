import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const bookSourcesView = readFileSync(resolve(__dirname, './BookSourcesView.vue'), 'utf-8')

describe('书源导入按钮', () => {
  it('使用向下箭头落入托盘的导入图标', () => {
    expect(bookSourcesView).toContain('<el-icon><Download /></el-icon>\n          导入书源')
    expect(bookSourcesView).toContain('  Download,')
    expect(bookSourcesView).not.toContain('<el-icon><Upload /></el-icon>\n          导入书源')
  })
})
