import { platform } from './capabilities'

type NativeInvoke = (command: string) => Promise<unknown>

interface FullscreenDependencies {
  desktop?: boolean
  document?: Document
  invoke?: NativeInvoke
  warn?: (message: string, error: unknown) => void
}

function browserDocument(override?: Document): Document | undefined {
  if (override) return override
  return typeof document === 'undefined' ? undefined : document
}

async function nativeInvoke(dependencies: FullscreenDependencies): Promise<NativeInvoke> {
  if (dependencies.invoke) return dependencies.invoke
  const { invoke } = await import('@tauri-apps/api/core')
  return command => invoke(command)
}

export async function toggleAppFullscreen(
  dependencies: FullscreenDependencies = {},
): Promise<boolean> {
  const desktop = dependencies.desktop ?? platform.isDesktop
  if (desktop) {
    try {
      const invoke = await nativeInvoke(dependencies)
      return await invoke('toggle_fullscreen') as boolean
    } catch (error) {
      const warn = dependencies.warn ?? console.warn
      warn('Tauri toggle_fullscreen 调用失败，回退到 HTML5 Fullscreen API:', error)
    }
  }

  const target = browserDocument(dependencies.document)
  if (!target) return false
  if (!target.fullscreenElement && target.documentElement.requestFullscreen) {
    await target.documentElement.requestFullscreen()
    return true
  }
  if (target.fullscreenElement && target.exitFullscreen) {
    await target.exitFullscreen()
    return false
  }
  return false
}

export async function exitAppFullscreen(
  dependencies: FullscreenDependencies = {},
): Promise<void> {
  const desktop = dependencies.desktop ?? platform.isDesktop
  if (desktop) {
    try {
      const invoke = await nativeInvoke(dependencies)
      await invoke('exit_fullscreen')
      return
    } catch (error) {
      const warn = dependencies.warn ?? console.warn
      warn('Tauri exit_fullscreen 调用失败，回退到 HTML5 Fullscreen API:', error)
    }
  }

  const target = browserDocument(dependencies.document)
  if (target?.fullscreenElement && target.exitFullscreen) {
    await target.exitFullscreen()
  }
}
