import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function source(path: string): string {
  return readFileSync(resolve(__dirname, path), 'utf8').replace(/\r\n/g, '\n')
}

describe('阅读页滚动宿主', () => {
  const app = source('../App.vue')
  const reader = source('../views/ReaderView.vue')
  const settings = source('../components/ReadSettings.vue')

  it('阅读路由固定为视口高度，并由 app-content 承担正文滚动', () => {
    expect(app).toContain(`.app-container.reader-surface-active {
  display: flex;
  height: 100vh;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}`)
    expect(app).toContain(`.app-container.reader-surface-active .app-content {
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;`)
  })

  it('进度监听、跳转和无限加载统一使用正文滚动宿主', () => {
    expect(reader).toContain("scrollHostRef.value?.addEventListener('scroll', onScroll")
    expect(reader).toContain("scrollHostRef.value?.removeEventListener('scroll', onScroll)")
    expect(reader).not.toContain("window.addEventListener('scroll', onScroll")
    expect(reader).toContain('container: readerScrollContainer()')
    expect(reader).toContain('root: scrollHostRef.value')
  })

  it('设置列表阻止滚动到边界后继续带动正文', () => {
    expect(settings).toContain('overscroll-behavior: contain;')
  })
})
