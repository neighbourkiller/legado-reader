// @vitest-environment jsdom
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReaderContextMenu from './ReaderContextMenu.vue'
import { useReaderContextMenu, type ReaderContextMenuAction } from '@/composables/useReaderContextMenu'

let app: App | undefined
let host: HTMLElement
let content: HTMLElement
let blocked = false
const beforeOpen = vi.fn()
const action = vi.fn()
const pageClick = vi.fn()
const fullscreen = ref(false)
const rect = (x: number, y: number, width: number, height: number) => new DOMRect(x, y, width, height)
const settle = async () => { for (let i = 0; i < 5; i++) await nextTick() }
const menu = () => document.querySelector<HTMLElement>('[role="menu"]')
const buttons = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
function pointer(target: Element, type = 'mouse', button = 2) {
  const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button })
  Object.defineProperty(event, 'pointerType', { value: type })
  target.dispatchEvent(event)
}
async function rightClick(target: Element = content, x = 400, y = 300, type = 'mouse') {
  pointer(target, type)
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: x, clientY: y })
  target.dispatchEvent(event)
  await settle()
  return event
}
function key(type: 'keydown' | 'keyup', value: string, target: Element = document.activeElement!, shiftKey = false) {
  const event = new KeyboardEvent(type, { key: value, shiftKey, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

beforeEach(async () => {
  vi.clearAllMocks()
  blocked = false
  fullscreen.value = false
  window.getSelection()?.removeAllRanges()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.matches('[role="menu"]') ? rect(0, 0, 200, 200) : rect(0, 36, 1024, 732)
  })
  host = document.createElement('div')
  host.className = 'app-content'
  document.body.append(host)
  app = createApp(defineComponent({
    setup() {
      const root = ref<HTMLElement>()
      const reader = ref<HTMLElement>()
      const context = useReaderContextMenu({ root, content: reader, blocked: () => blocked, beforeOpen })
      const onAction = (value: ReaderContextMenuAction) => { action(value); context.close() }
      return () => h('div', { ref: root, onContextmenu: context.onContextMenu, onKeydown: context.onKeyDown }, [
        h('div', { ref: reader, tabindex: 0, 'aria-label': '正文', onClick: pageClick }, '阅读正文'),
        context.position.value && h(ReaderContextMenu, {
          position: context.position.value, background: '#faf6ee', color: '#262626', isNight: false,
          isFullscreen: fullscreen.value, onAction, onClose: () => context.close(),
        }),
      ])
    },
  }))
  app.mount(host)
  content = host.querySelector('[aria-label="正文"]')!
  content.focus()
  await settle()
})
afterEach(() => {
  app?.unmount(); app = undefined
  host.remove()
  window.getSelection()?.removeAllRanges()
  vi.restoreAllMocks()
})

describe('阅读右键菜单行为', () => {
  it('显示五项操作、焦点及全屏状态，重复右键更新位置', async () => {
    expect((await rightClick()).defaultPrevented).toBe(true)
    expect(buttons().map(item => item.textContent)).toEqual(['目录', '阅读设置', '书签与划线', '进入全屏', '返回书架'])
    expect(document.activeElement).toBe(buttons()[0])
    expect(menu()!.style.left).toBe('402px')
    fullscreen.value = true
    await settle()
    expect(buttons()[3]!.textContent).toBe('退出全屏')
    await rightClick(content, 100, 100)
    expect(menu()!.style.left).toBe('102px')
    expect(beforeOpen).toHaveBeenCalledTimes(2)
  })

  it.each(['catalog', 'settings', 'bookmarks', 'fullscreen', 'shelf'] as const)('点击执行 %s 且关闭菜单', async command => {
    await rightClick()
    buttons()[['catalog', 'settings', 'bookmarks', 'fullscreen', 'shelf'].indexOf(command)]!.click()
    await settle()
    expect(action).toHaveBeenCalledExactlyOnceWith(command)
    expect(menu()).toBeNull()
    expect(pageClick).not.toHaveBeenCalled()
  })

  it('右下角约束在视口内，顶部避开桌面标题栏', async () => {
    await rightClick(content, 1023, 767)
    expect(menu()!.style.left).toBe('816px')
    expect(menu()!.style.top).toBe('560px')
    await rightClick(content, 0, 0)
    expect(menu()!.style.left).toBe('8px')
    expect(menu()!.style.top).toBe('44px')
  })

  it.each(['a', 'img', 'input', 'textarea', 'select', 'button', 'video', 'svg', '[contenteditable]', '[data-reader-highlight]', '[role="toolbar"]', '[role="dialog"]'])('保留 %s 的原生右键行为', async selector => {
    const target = document.createElement(selector.startsWith('[') ? 'span' : selector)
    if (selector === '[contenteditable]') target.setAttribute('contenteditable', 'true')
    if (selector === '[data-reader-highlight]') target.setAttribute('data-reader-highlight', 'mark')
    if (selector.startsWith('[role=')) target.setAttribute('role', selector.includes('toolbar') ? 'toolbar' : 'dialog')
    content.append(target)
    expect((await rightClick(target)).defaultPrevented).toBe(false)
    expect(menu()).toBeNull()
  })

  it('存在选区、弹窗或触屏长按时保留原行为', async () => {
    const range = document.createRange()
    range.selectNodeContents(content)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    expect(window.getSelection()!.toString()).toBe('阅读正文')
    expect((await rightClick()).defaultPrevented).toBe(false)
    expect(key('keydown', 'F10', content, true).defaultPrevented).toBe(false)
    window.getSelection()!.removeAllRanges()
    blocked = true
    expect((await rightClick()).defaultPrevented).toBe(false)
    blocked = false
    expect((await rightClick(content, 400, 300, 'touch')).defaultPrevented).toBe(false)
    expect(menu()).toBeNull()
  })

  it('键盘菜单键、循环导航和执行不冒泡为阅读按键', async () => {
    const pageKey = vi.fn()
    window.addEventListener('keyup', pageKey)
    try {
      key('keydown', 'F10', content, true)
      key('keyup', 'F10', content, true)
      await settle()
      expect(document.activeElement).toBe(buttons()[0])
      key('keydown', 'ArrowUp'); key('keyup', 'ArrowUp')
      expect(document.activeElement).toBe(buttons()[4])
      key('keydown', 'ArrowDown'); key('keyup', 'ArrowDown')
      expect(document.activeElement).toBe(buttons()[0])
      key('keydown', 'End'); key('keyup', 'End')
      expect(document.activeElement).toBe(buttons()[4])
      key('keydown', 'Home'); key('keyup', 'Home')
      key('keydown', 'ArrowDown'); key('keyup', 'ArrowDown')
      key('keydown', 'Enter')
      await settle()
      key('keyup', 'Enter')
      expect(action).toHaveBeenCalledExactlyOnceWith('settings')
      expect(pageKey).not.toHaveBeenCalled()
    } finally { window.removeEventListener('keyup', pageKey) }
  })

  it('Esc 同时隔离 keydown/keyup，全屏处理不接收本次 Esc', async () => {
    const globalKey = vi.fn()
    window.addEventListener('keydown', globalKey)
    window.addEventListener('keyup', globalKey)
    try {
      await rightClick()
      key('keydown', 'Escape')
      await settle()
      key('keyup', 'Escape')
      expect(menu()).toBeNull()
      expect(document.activeElement).toBe(content)
      expect(globalKey).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', globalKey)
      window.removeEventListener('keyup', globalKey)
    }
  })

  it('Tab 恢复起点且不阻止浏览器继续焦点移动', async () => {
    await rightClick()
    expect(key('keydown', 'Tab').defaultPrevented).toBe(false)
    await settle()
    expect(document.activeElement).toBe(content)
    expect(menu()).toBeNull()
  })

  it('键盘打开后取消，再选字使用菜单键仍保留原生菜单', async () => {
    key('keydown', 'ContextMenu', content)
    key('keyup', 'ContextMenu', content)
    await settle()
    key('keydown', 'Escape')
    key('keyup', 'Escape')
    await settle()
    const range = document.createRange()
    range.selectNodeContents(content)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    expect(key('keydown', 'ContextMenu', content).defaultPrevented).toBe(false)
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    content.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(menu()).toBeNull()
  })

  it('外部首次点击只关闭菜单，下一次点击正常翻页', async () => {
    await rightClick()
    pointer(content, 'mouse', 0)
    content.click()
    await settle()
    expect(menu()).toBeNull()
    expect(pageClick).not.toHaveBeenCalled()
    pointer(content, 'mouse', 0)
    content.click()
    expect(pageClick).toHaveBeenCalledTimes(1)
  })

  it.each(['scroll', 'resize', 'blur'])('%s 关闭菜单', async event => {
    await rightClick()
    ;(event === 'scroll' ? host : window).dispatchEvent(new Event(event))
    await settle()
    expect(menu()).toBeNull()
  })

  it('卸载清理全局事件，不拦截后续页面按键', async () => {
    await rightClick()
    key('keydown', 'Escape')
    app!.unmount(); app = undefined
    const event = key('keyup', 'Escape', document.body)
    expect(event.defaultPrevented).toBe(false)
    expect(document.querySelector('[data-reader-context-menu]')).toBeNull()
  })
})
