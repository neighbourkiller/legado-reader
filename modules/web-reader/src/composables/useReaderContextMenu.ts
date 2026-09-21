import { onMounted, onUnmounted, readonly, shallowRef, type Ref } from 'vue'

export type ReaderContextMenuAction = 'catalog' | 'settings' | 'bookmarks' | 'fullscreen' | 'shelf'
export interface ReaderContextMenuPosition {
  x: number
  y: number
  bounds: { left: number; top: number; right: number; bottom: number }
}

const excludedTargets = [
  'a', 'img', 'svg', 'button', 'input', 'textarea', 'select', 'audio', 'video',
  '[contenteditable]:not([contenteditable="false"])', '[data-reader-highlight]',
  '[role="toolbar"]', '[role="dialog"]', '[role="menu"]',
  '.reader-floating-dock-container', '.reader-dock-popover', '.el-overlay', '.el-popper',
].join(',')
const menuKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' ', 'Escape', 'Tab'])

export function useReaderContextMenu(options: {
  root: Ref<HTMLElement | undefined>
  content: Ref<HTMLElement | undefined>
  blocked: () => boolean
  beforeOpen: () => void
}) {
  const position = shallowRef<ReaderContextMenuPosition | null>(null)
  let previousFocus: HTMLElement | null = null
  let pointerType = 'mouse'
  let suppressClick = false
  let keyboardContextPending = false
  const pendingKeyUps = new Set<string>()

  const restoreFocus = () => {
    const target = previousFocus?.isConnected && !previousFocus.closest('[inert], [hidden]')
      && previousFocus !== document.body ? previousFocus : options.content.value
    target?.focus({ preventScroll: true })
    previousFocus = null
  }

  const close = (restore = true) => {
    if (!position.value) return
    position.value = null
    if (restore) restoreFocus()
    else previousFocus = null
  }

  const eligible = (target: EventTarget | null) => {
    if (options.blocked() || !(target instanceof Element)) return false
    if (!options.root.value?.contains(target) || target.closest(excludedTargets)) return false
    return !window.getSelection()?.toString().length
  }

  const open = (x?: number, y?: number) => {
    const root = options.root.value
    if (!root) return
    const rect = root.getBoundingClientRect()
    const host = root.closest('.app-content')?.getBoundingClientRect()
    const bounds = {
      left: Math.max(0, rect.left, host?.left ?? 0),
      top: Math.max(0, rect.top, host?.top ?? 0),
      right: Math.min(window.innerWidth, rect.right, host?.right ?? window.innerWidth),
      bottom: Math.min(window.innerHeight, rect.bottom, host?.bottom ?? window.innerHeight),
    }
    if (bounds.right - bounds.left < 32 || bounds.bottom - bounds.top < 32) return
    if (!position.value) previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    options.beforeOpen()
    position.value = {
      x: x ?? (bounds.left + bounds.right) / 2,
      y: y ?? (bounds.top + bounds.bottom) / 2,
      bounds,
    }
  }

  const onContextMenu = (event: MouseEvent) => {
    if (keyboardContextPending) {
      keyboardContextPending = false
      event.preventDefault()
      return
    }
    const type = (event as PointerEvent).pointerType || pointerType
    if (type !== 'mouse' || event.button !== 2 || !eligible(event.target)) return
    event.preventDefault()
    event.stopPropagation()
    open(event.clientX, event.clientY)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (!(event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) return
    keyboardContextPending = false
    if (!eligible(event.target)) return
    event.preventDefault()
    event.stopPropagation()
    pendingKeyUps.add(event.key)
    keyboardContextPending = true
    open()
  }

  const insideMenu = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('[data-reader-context-menu]'))

  const onPointerDown = (event: PointerEvent) => {
    pointerType = event.pointerType || 'mouse'
    keyboardContextPending = false
    suppressClick = false
    if (!position.value || insideMenu(event.target)) return
    // 保留菜单，允许另一次合格的右键直接移动它。
    if (event.button === 2 && pointerType === 'mouse' && eligible(event.target)) return
    suppressClick = event.button === 0
    if (suppressClick) {
      event.preventDefault()
      event.stopPropagation()
    }
    close()
  }

  const onClick = (event: MouseEvent) => {
    if (!suppressClick) return
    suppressClick = false
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  const trackMenuKey = (event: KeyboardEvent) => {
    if (position.value && menuKeys.has(event.key)) pendingKeyUps.add(event.key)
    // F11 仍交给应用处理，提前关闭菜单避免焦点落在已移动的弹层上。
    if (position.value && event.key === 'F11') close()
  }
  const onKeyUp = (event: KeyboardEvent) => {
    if (!pendingKeyUps.delete(event.key)) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  const onScroll = (event: Event) => {
    if (!insideMenu(event.target)) close()
  }
  const onResize = () => close()
  const onBlur = () => {
    close(false)
    pendingKeyUps.clear()
    suppressClick = false
    keyboardContextPending = false
  }

  onMounted(() => {
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', trackMenuKey, true)
    document.addEventListener('keyup', onKeyUp, true)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    window.addEventListener('blur', onBlur)
  })
  onUnmounted(() => {
    close(false)
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('keydown', trackMenuKey, true)
    document.removeEventListener('keyup', onKeyUp, true)
    document.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('resize', onResize)
    window.removeEventListener('blur', onBlur)
    pendingKeyUps.clear()
    previousFocus = null
  })

  return { position: readonly(position), close, onContextMenu, onKeyDown }
}
