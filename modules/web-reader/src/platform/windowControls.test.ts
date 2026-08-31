import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  platform: { isDesktop: true },
  getCurrentWindow: vi.fn(),
}))

vi.mock('./capabilities', () => ({ platform: mocks.platform }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: mocks.getCurrentWindow }))

import { desktopWindowControls } from './windowControls'

describe('原生窗口平台适配', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.platform.isDesktop = true
  })

  it('把窗口控制与 resize 订阅委托给当前 Tauri 窗口', async () => {
    const unlisten = vi.fn()
    const appWindow = {
      isMaximized: vi.fn(async () => true),
      minimize: vi.fn(async () => undefined),
      toggleMaximize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onResized: vi.fn(async (listener: () => void) => {
        listener()
        return unlisten
      }),
    }
    mocks.getCurrentWindow.mockReturnValue(appWindow)
    const listener = vi.fn()

    await expect(desktopWindowControls.isMaximized()).resolves.toBe(true)
    await desktopWindowControls.minimize()
    await desktopWindowControls.toggleMaximize()
    await desktopWindowControls.close()
    await expect(desktopWindowControls.onResized(listener)).resolves.toBe(unlisten)

    expect(appWindow.minimize).toHaveBeenCalledOnce()
    expect(appWindow.toggleMaximize).toHaveBeenCalledOnce()
    expect(appWindow.close).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledOnce()
  })

  it('非桌面环境返回安全默认值且不加载窗口对象', async () => {
    mocks.platform.isDesktop = false

    await expect(desktopWindowControls.isMaximized()).resolves.toBe(false)
    await desktopWindowControls.minimize()
    await desktopWindowControls.toggleMaximize()
    await desktopWindowControls.close()
    const unlisten = await desktopWindowControls.onResized(vi.fn())
    unlisten()

    expect(mocks.getCurrentWindow).not.toHaveBeenCalled()
  })
})
