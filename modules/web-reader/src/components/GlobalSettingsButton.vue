<template>
  <button
    type="button"
    class="global-settings-button"
    :class="{ active: isSettingsRoute }"
    aria-label="打开设置"
    @click="openSettings"
  >
    <el-icon><Setting /></el-icon>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Setting } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const isSettingsRoute = computed(() => route.path.startsWith('/settings'))

const openSettings = () => {
  if (!isSettingsRoute.value) {
    router.push('/settings')
  }
}
</script>

<style scoped>
.global-settings-button {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1900;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border: 1px solid var(--el-border-color-light);
  border-radius: 50%;
  color: var(--el-text-color-regular);
  background: var(--el-bg-color-overlay);
  box-shadow: var(--el-box-shadow-light);
  cursor: pointer;
  transition: color 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}

.global-settings-button .el-icon {
  font-size: 22px;
}

.global-settings-button:hover,
.global-settings-button.active {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
  transform: translateY(-2px);
}

@media screen and (max-width: 768px) {
  .global-settings-button {
    right: 16px;
    bottom: 16px;
    width: 44px;
    height: 44px;
  }
}
</style>
