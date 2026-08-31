import { platform } from './capabilities'

async function currentWindow() {
  if (!platform.isDesktop) return undefined
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  return getCurrentWindow()
}

export const desktopWindowControls = {
  async isMaximized(): Promise<boolean> {
    return (await currentWindow())?.isMaximized() ?? false
  },

  async minimize(): Promise<void> {
    await (await currentWindow())?.minimize()
  },

  async toggleMaximize(): Promise<void> {
    await (await currentWindow())?.toggleMaximize()
  },

  async close(): Promise<void> {
    await (await currentWindow())?.close()
  },

  async onResized(listener: () => void): Promise<() => void> {
    const appWindow = await currentWindow()
    if (!appWindow) return () => undefined
    return appWindow.onResized(listener)
  },
}
