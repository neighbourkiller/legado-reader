<template>
  <header
    class="app-titlebar"
    :class="{ dark: isDark }"
    data-tauri-drag-region
    @dblclick="toggleMaximize"
  >
    <div class="titlebar-drag-area" data-tauri-drag-region>
      <span class="app-title" data-tauri-drag-region>Legado Reader</span>
    </div>

    <div class="window-controls" @dblclick.stop>
      <button type="button" class="window-control" aria-label="最小化" @click="minimize">
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 8.5h8" />
        </svg>
      </button>
      <button
        type="button"
        class="window-control"
        :aria-label="isMaximized ? '还原窗口' : '最大化窗口'"
        @click="toggleMaximize"
      >
        <svg v-if="isMaximized" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M4 2.5h5.5V8H8M2.5 4H8v5.5H2.5z" />
        </svg>
        <svg v-else viewBox="0 0 12 12" aria-hidden="true">
          <rect x="2.5" y="2.5" width="7" height="7" />
        </svg>
      </button>
      <button type="button" class="window-control close" aria-label="关闭窗口" @click="closeWindow">
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 2.5l7 7m0-7l-7 7" />
        </svg>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useTheme } from '@/composables/useTheme'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const appWindow = isTauri ? getCurrentWindow() : undefined
const { isDark } = useTheme()
const isMaximized = ref(false)
let unlistenResize: (() => void) | undefined

const refreshMaximized = async () => {
  if (!isTauri) return
  isMaximized.value = await appWindow!.isMaximized()
}

const minimize = async () => {
  if (!isTauri) return
  await appWindow!.minimize()
}

const toggleMaximize = async () => {
  if (!isTauri) return
  await appWindow!.toggleMaximize()
  await refreshMaximized()
}

const closeWindow = async () => {
  if (!isTauri) return
  await appWindow!.close()
}

onMounted(async () => {
  if (!isTauri) return
  await refreshMaximized()
  unlistenResize = await appWindow!.onResized(refreshMaximized)
})

onUnmounted(() => unlistenResize?.())
</script>

<style scoped>
.app-titlebar {
  position: relative;
  z-index: 10010;
  display: flex;
  width: 100%;
  height: 36px;
  flex: 0 0 36px;
  color: #30343a;
  background: #edf0f3;
  border-bottom: 1px solid #dfe3e8;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  user-select: none;
  transition: color 0.25s ease, background-color 0.25s ease, border-color 0.25s ease;
}

.app-titlebar.dark {
  color: #d6d8dc;
  background: #202225;
  border-bottom-color: #2d3034;
}

.titlebar-drag-area {
  position: relative;
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding-left: 138px;
}

.app-title {
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.window-controls {
  display: flex;
  height: 100%;
}

.window-control {
  display: grid;
  width: 46px;
  height: 100%;
  padding: 0;
  border: 0;
  border-radius: 0;
  color: inherit;
  background: transparent;
  cursor: default;
  place-items: center;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.window-control:hover {
  background: rgba(30, 36, 44, 0.09);
}

.app-titlebar.dark .window-control:hover {
  background: rgba(255, 255, 255, 0.08);
}

.window-control.close:hover {
  color: #ffffff;
  background: #c42b1c;
}

.window-control svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: square;
  stroke-linejoin: miter;
  stroke-width: 1.15;
}

@media screen and (max-width: 640px) {
  .titlebar-drag-area {
    justify-content: flex-start;
    padding-left: 12px;
  }

  .window-control {
    width: 42px;
  }
}
</style>
