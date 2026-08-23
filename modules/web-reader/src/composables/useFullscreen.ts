import { ref } from 'vue'

const isFullscreen = ref(false)
let toggleOperation: Promise<boolean> | null = null

if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = document.fullscreenElement !== null
  })
}

export function useFullscreen() {
  const toggleFullscreen = async (): Promise<boolean> => {
    // 同一次按键可能被多个调用方观察到；复用进行中的操作，避免连续反转状态。
    if (toggleOperation) return toggleOperation

    const operation = performToggle()
    toggleOperation = operation
    try {
      return await operation
    } finally {
      if (toggleOperation === operation) toggleOperation = null
    }
  }

  const performToggle = async (): Promise<boolean> => {
    // 1. 优先尝试调用 Tauri 原生窗口全屏
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const { invoke } = await import('@tauri-apps/api/core')
        const result = await invoke<boolean>('toggle_fullscreen')
        isFullscreen.value = result
        return result
      }
    } catch (e) {
      console.warn('Tauri toggle_fullscreen 调用失败，回退到 HTML5 Fullscreen API:', e)
    }

    // 2. Web 浏览器环境回退：HTML5 Fullscreen API
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen()
        isFullscreen.value = true
        return true
      }
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen()
        isFullscreen.value = false
        return false
      }
    }
    return false
  }

  const exitFullscreen = async (): Promise<void> => {
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('exit_fullscreen')
        isFullscreen.value = false
        return
      }
    } catch (e) {
      console.warn('Tauri exit_fullscreen 调用失败，回退到 HTML5 Fullscreen API:', e)
    }

    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen()
      isFullscreen.value = false
    }
  }

  return {
    isFullscreen,
    toggleFullscreen,
    exitFullscreen,
  }
}
