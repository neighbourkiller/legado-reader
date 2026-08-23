<template>
  <button
    v-if="!isHomeRoute"
    type="button"
    class="global-home-button"
    aria-label="回到主页"
    @click="router.push('/')"
  >
    <el-icon><House /></el-icon>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { House } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const isHomeRoute = computed(() => route.path === '/')
</script>

<style scoped>
.global-home-button {
  position: fixed;
  right: 84px;
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

.global-home-button .el-icon {
  font-size: 22px;
}

.global-home-button:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
  transform: translateY(-2px);
}

@media screen and (max-width: 768px) {
  .global-home-button {
    right: 72px;
    bottom: 16px;
    width: 44px;
    height: 44px;
  }
}
</style>
