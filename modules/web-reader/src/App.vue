<template>
  <el-config-provider>
    <div
      class="app-container"
      :class="{
        'desktop-app': isDesktop,
        'desktop-app-with-titlebar': isDesktop && !isFullscreen,
        'reader-surface-active': isReaderRoute,
      }"
      :style="readerSurfaceStyle"
    >
      <AppTitleBar v-if="isDesktop && !isFullscreen" />
      <div class="app-content">
        <router-view />
      </div>
      <GlobalDownloadProgress />
      <ThemeSyncDialog />
      <GlobalHomeButton />
      <GlobalSettingsButton />
    </div>
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from '@/composables/useTheme'
import { useFullscreen } from '@/composables/useFullscreen'
import GlobalDownloadProgress from '@/components/GlobalDownloadProgress.vue'
import ThemeSyncDialog from '@/components/ThemeSyncDialog.vue'
import GlobalHomeButton from '@/components/GlobalHomeButton.vue'
import GlobalSettingsButton from '@/components/GlobalSettingsButton.vue'
import AppTitleBar from '@/components/AppTitleBar.vue'
import { useAppSettingsStore } from '@/stores/appSettings'
import { useReadingStore } from '@/stores/reading'
import {
  READER_SURFACE_BACKGROUND_PROPERTY,
  resolveReaderSurfaceBackground,
  syncReaderSurfaceDocument,
} from '@/reader/readerSurface'

const isDesktop = import.meta.env.VITE_APP_TARGET === 'desktop'

// Initialize theme globally
useTheme()
useAppSettingsStore()

const route = useRoute()
const readingStore = useReadingStore()
const { isFullscreen, toggleFullscreen, exitFullscreen } = useFullscreen()

const isReaderRoute = computed(() => route.name === 'reader')
const readerSurfaceBackground = computed(() =>
  resolveReaderSurfaceBackground(readingStore.settings.theme)
)
const readerSurfaceStyle = computed(() => isReaderRoute.value
  ? { [READER_SURFACE_BACKGROUND_PROPERTY]: readerSurfaceBackground.value }
  : undefined
)

const stopWatchingReaderSurface = watch(
  [isReaderRoute, readerSurfaceBackground],
  ([active, background]) => syncReaderSurfaceDocument(active, background),
  { immediate: true, flush: 'sync' },
)

const syncDesktopTitlebarClass = (fullscreen: boolean) => {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle(
    'desktop-with-titlebar',
    isDesktop && !fullscreen,
  )
}

const stopWatchingFullscreen = watch(isFullscreen, syncDesktopTitlebarClass, {
  immediate: true,
})

const handleGlobalKeyDown = async (e: KeyboardEvent) => {
  if (e.key === 'F11') {
    e.preventDefault()
    e.stopPropagation()
    if (e.repeat) return
    await toggleFullscreen()
  } else if (e.key === 'Escape') {
    await exitFullscreen()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown)
  stopWatchingFullscreen()
  stopWatchingReaderSurface()
  document.documentElement.classList.remove('desktop-with-titlebar')
  syncReaderSurfaceDocument(false, readerSurfaceBackground.value)
})
</script>

<style>
html, body, #app {
  width: 100%;
  min-height: 100%;
  margin: 0;
  padding: 0;
}

*, *::before, *::after {
  box-sizing: border-box;
}

/* ElMessage 会直接挂到 body，需为桌面自绘标题栏预留安全区。 */
html.desktop-with-titlebar .el-message:not(.is-bottom) {
  margin-top: 36px;
}

/* 批测全屏对话框会 Teleport 到 body，桌面非全屏时需避开自绘标题栏。 */
html.desktop-with-titlebar .source-audit-overlay .el-overlay-dialog {
  top: 36px;
}

/* 阅读页滚动时根画布也保持阅读主题，避免 WebView 合成帧露出全局主题。 */
html.reader-surface-active,
html.reader-surface-active body,
html.reader-surface-active #app {
  background: var(--reader-surface-background, #f4eee1);
}
</style>

<style scoped>
.app-container {
  width: 100%;
  min-height: 100%;
  margin: 0;
  padding: 0;
}

.desktop-app {
  --reader-toolbar-top: 0px;
  display: flex;
  height: 100vh;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.desktop-app-with-titlebar {
  --reader-toolbar-top: 36px;
}

.app-content {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.app-container.reader-surface-active,
.app-container.reader-surface-active .app-content {
  background: var(--reader-surface-background, #f4eee1);
}

.app-container.reader-surface-active .app-content {
  overscroll-behavior: none;
}

.desktop-app .app-content > :deep(*) {
  height: 100% !important;
  min-height: 100% !important;
}
</style>
