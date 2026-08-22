<template>
  <el-config-provider>
    <div class="app-container">
      <router-view />
    </div>
  </el-config-provider>
</template>

<script setup lang="ts">
import { useTheme } from '@/composables/useTheme'

// Initialize theme globally
useTheme()
</script>

<style>
html, body, #app {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

*, *::before, *::after {
  box-sizing: border-box;
}
</style>

<style scoped>
.app-container {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
}
</style>
