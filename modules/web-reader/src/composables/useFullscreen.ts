import { ref } from 'vue'
import { exitAppFullscreen, toggleAppFullscreen } from '@/platform/fullscreen'

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
    const result = await toggleAppFullscreen()
    isFullscreen.value = result
    return result
  }

  const exitFullscreen = async (): Promise<void> => {
    await exitAppFullscreen()
    isFullscreen.value = false
  }

  return {
    isFullscreen,
    toggleFullscreen,
    exitFullscreen,
  }
}
