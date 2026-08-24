<template>
  <div class="theme-settings-panel">
    <section class="setting-section">
      <div class="section-copy">
        <h3>主题模式</h3>
        <p>选择应用界面的明暗显示方式</p>
      </div>
      <ThemeToggle />
    </section>

    <section class="setting-section accent-section">
      <div class="section-copy">
        <h3>强调色</h3>
        <p>应用于按钮、选中状态和主要操作</p>
      </div>
      <div class="accent-options" role="radiogroup" aria-label="主题强调色">
        <button
          v-for="option in THEME_ACCENT_OPTIONS"
          :key="option.value"
          type="button"
          class="accent-option"
          :class="{ active: themeAccent === option.value }"
          :aria-checked="themeAccent === option.value"
          :aria-label="option.label"
          role="radio"
          @click="setAccent(option.value)"
        >
          <span class="accent-swatch" :style="{ backgroundColor: option.color }" />
          <span>{{ option.label }}</span>
        </button>
      </div>
    </section>

    <div class="panel-actions">
      <el-button @click="resetTheme">恢复默认主题</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import ThemeToggle from '@/components/ThemeToggle.vue'
import {
  DEFAULT_THEME_ACCENT,
  DEFAULT_THEME_MODE,
  THEME_ACCENT_OPTIONS,
  useTheme,
} from '@/composables/useTheme'
import { useThemeController } from '@/composables/useThemeController'

const { themeAccent, setAccent } = useTheme()
const { requestTheme } = useThemeController()

const resetTheme = () => {
  setAccent(DEFAULT_THEME_ACCENT)
  requestTheme(DEFAULT_THEME_MODE)
}
</script>

<style scoped>
.theme-settings-panel {
  margin-top: 24px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-bg-color-overlay);
}

.setting-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 92px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.accent-section {
  align-items: flex-start;
}

.section-copy h3 {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 500;
}

.section-copy p {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.accent-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(82px, 1fr));
  gap: 10px;
}

.accent-option {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 84px;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 7px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-blank);
  cursor: pointer;
}

.accent-option:hover,
.accent-option.active {
  border-color: var(--el-color-primary);
}

.accent-option.active {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.accent-swatch {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12);
}

.panel-actions {
  padding: 16px 20px;
  text-align: right;
}

@media screen and (max-width: 768px) {
  .setting-section {
    align-items: flex-start;
    flex-direction: column;
  }

  .accent-options {
    width: 100%;
    grid-template-columns: repeat(2, minmax(82px, 1fr));
  }
}
</style>
