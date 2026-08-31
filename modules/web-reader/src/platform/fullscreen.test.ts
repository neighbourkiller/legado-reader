// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { exitAppFullscreen, toggleAppFullscreen } from './fullscreen'

function fullscreenDocument(active = false) {
  const requestFullscreen = vi.fn(async () => undefined)
  const exitFullscreen = vi.fn(async () => undefined)
  const target = {
    fullscreenElement: active ? {} : null,
    documentElement: { requestFullscreen },
    exitFullscreen,
  } as unknown as Document
  return { target, requestFullscreen, exitFullscreen }
}

describe('全屏平台适配', () => {
  it('桌面环境优先调用原生全屏', async () => {
    const invoke = vi.fn(async () => true)
    await expect(toggleAppFullscreen({ desktop: true, invoke })).resolves.toBe(true)
    expect(invoke).toHaveBeenCalledWith('toggle_fullscreen')
  })

  it('桌面调用失败时回退到 HTML5 全屏', async () => {
    const { target, requestFullscreen } = fullscreenDocument()
    const warn = vi.fn()

    await expect(toggleAppFullscreen({
      desktop: true,
      document: target,
      invoke: vi.fn(async () => { throw new Error('IPC failed') }),
      warn,
    })).resolves.toBe(true)

    expect(requestFullscreen).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledOnce()
  })

  it('Web 环境通过 HTML5 API 进入和退出全屏', async () => {
    const entering = fullscreenDocument()
    await expect(toggleAppFullscreen({ desktop: false, document: entering.target })).resolves.toBe(true)
    expect(entering.requestFullscreen).toHaveBeenCalledOnce()

    const leaving = fullscreenDocument(true)
    await expect(toggleAppFullscreen({ desktop: false, document: leaving.target })).resolves.toBe(false)
    expect(leaving.exitFullscreen).toHaveBeenCalledOnce()

    await exitAppFullscreen({ desktop: false, document: leaving.target })
    expect(leaving.exitFullscreen).toHaveBeenCalledTimes(2)
  })
})
