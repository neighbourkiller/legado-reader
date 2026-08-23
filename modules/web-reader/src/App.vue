<template>
  <el-config-provider>
    <div class="app-container">
      <router-view />
      <GlobalDownloadProgress />
    </div>
  </el-config-provider>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { useFullscreen } from '@/composables/useFullscreen'
import GlobalDownloadProgress from '@/components/GlobalDownloadProgress.vue'

// Initialize theme globally
useTheme()

const { toggleFullscreen, exitFullscreen } = useFullscreen()

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
</style>
