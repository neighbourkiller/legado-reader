<template>
  <el-config-provider>
    <div
      class="app-container"
      :class="{
        'desktop-app': isDesktop,
        'desktop-app-with-titlebar': isDesktop && !isFullscreen,
      }"
    >
      <AppTitleBar v-if="isDesktop && !isFullscreen" />
      <div class="app-content">
        <router-view />
      </div>
      <GlobalDownloadProgress />
      <ThemeSyncDialog />
      <GlobalHomeButton v-if="isDesktop" />
      <GlobalSettingsButton v-if="isDesktop" />
    </div>
  </el-config-provider>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { useFullscreen } from '@/composables/useFullscreen'
import GlobalDownloadProgress from '@/components/GlobalDownloadProgress.vue'
import ThemeSyncDialog from '@/components/ThemeSyncDialog.vue'
import GlobalHomeButton from '@/components/GlobalHomeButton.vue'
import GlobalSettingsButton from '@/components/GlobalSettingsButton.vue'
import AppTitleBar from '@/components/AppTitleBar.vue'

const isDesktop = import.meta.env.VITE_APP_TARGET === 'desktop'

// Initialize theme globally
useTheme()

const { isFullscreen, toggleFullscreen, exitFullscreen } = useFullscreen()

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

.desktop-app .app-content > :deep(*) {
  height: 100% !important;
  min-height: 100% !important;
}
</style>
