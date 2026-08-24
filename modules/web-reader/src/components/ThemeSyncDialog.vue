<template>
  <el-dialog
    :model-value="prompt.visible"
    title="同步阅读页主题"
    width="420px"
    :close-on-click-modal="false"
    @close="closePrompt"
  >
    <p class="dialog-copy">是否将本次全局明暗主题变化同步到阅读页？</p>
    <el-checkbox v-model="prompt.dontAskAgain">不再出现</el-checkbox>

    <template #footer>
      <el-button @click="chooseIndependent">仅更改全局</el-button>
      <el-button type="primary" @click="chooseSync">同步阅读页</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { useThemeController } from '@/composables/useThemeController'

const { prompt, chooseSync, chooseIndependent, closePrompt } = useThemeController()
</script>

<style scoped>
.dialog-copy {
  margin: 0 0 18px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
}
</style>
