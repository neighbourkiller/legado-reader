<template>
  <div class="theme-settings-panel">
    <el-alert
      v-if="themeSaveError"
      type="error"
      :title="`主题持久化失败：${themeSaveError}`"
      show-icon
      closable
      class="theme-error-alert"
      @close="themeSaveError = null"
    />
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

    <section class="setting-section font-section">
      <div class="section-copy font-section-copy">
        <div>
          <h3>界面字体</h3>
          <p>应用于 Web 与桌面客户端界面，不更改阅读页正文</p>
        </div>
        <el-radio-group
          :model-value="appSettingsStore.uiFont"
          aria-label="界面字体"
          @update:model-value="setUiFont"
        >
          <el-radio-button value="bundled">Inter + PingFang SC</el-radio-button>
          <el-radio-button value="system">跟随系统</el-radio-button>
        </el-radio-group>
      </div>
      <div class="font-preview ui-font-preview" lang="zh-CN">
        <span class="preview-label">界面预览</span>
        <strong>阅读，让时间有了刻度</strong>
        <span>Legado reader · 章节与书架</span>
      </div>
    </section>

    <section class="setting-section font-section">
      <div class="section-copy font-section-copy">
        <div>
          <h3>规则与代码字体</h3>
          <p>应用于书源规则、代码片段和 URL</p>
        </div>
        <el-radio-group
          :model-value="appSettingsStore.codeFont"
          aria-label="规则与代码字体"
          @update:model-value="setCodeFont"
        >
          <el-radio-button value="bundled">JetBrains Mono</el-radio-button>
          <el-radio-button value="system">系统等宽字体</el-radio-button>
        </el-radio-group>
      </div>
      <div class="font-preview code-font-preview">
        <span class="preview-label">规则预览</span>
        <code>https://example.com/book/42 · .title@text</code>
      </div>
    </section>

    <div class="panel-actions">
      <el-button @click="resetFonts">恢复默认字体</el-button>
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
import {
  DEFAULT_CODE_FONT,
  DEFAULT_UI_FONT,
  useAppSettingsStore,
  type CodeFontPreference,
  type UiFontPreference,
} from '@/stores/appSettings'

const { themeAccent, setAccent, themeSaveError } = useTheme()
const { requestTheme } = useThemeController()
const appSettingsStore = useAppSettingsStore()

const setUiFont = (value: string | number | boolean | undefined) => {
  if (value === 'bundled' || value === 'system') {
    appSettingsStore.setUiFont(value as UiFontPreference)
  }
}

const setCodeFont = (value: string | number | boolean | undefined) => {
  if (value === 'bundled' || value === 'system') {
    appSettingsStore.setCodeFont(value as CodeFontPreference)
  }
}

const resetFonts = () => {
  appSettingsStore.setFonts(DEFAULT_UI_FONT, DEFAULT_CODE_FONT)
}

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

.font-section {
  align-items: stretch;
  flex-direction: column;
  gap: 14px;
}

.font-section-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
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

.font-preview {
  position: relative;
  display: flex;
  width: 100%;
  min-height: 82px;
  padding: 18px 20px 16px 132px;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter);
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  overflow: hidden;
}

.font-preview::before {
  position: absolute;
  top: 16px;
  bottom: 16px;
  left: 112px;
  width: 1px;
  background: var(--el-border-color);
  content: '';
}

.preview-label {
  position: absolute;
  left: 18px;
  width: 76px;
  color: var(--el-text-color-secondary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.ui-font-preview {
  font-family: var(--legado-font-ui);
}

.ui-font-preview strong {
  color: var(--el-text-color-primary);
  font-size: 17px;
  font-weight: 650;
}

.ui-font-preview > span:last-child {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.code-font-preview code {
  color: var(--el-text-color-primary);
  font-family: var(--legado-font-code);
  font-size: 13px;
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

  .font-section-copy {
    align-items: flex-start;
    flex-direction: column;
  }

  .font-preview {
    padding: 48px 14px 14px;
  }

  .font-preview::before {
    top: 38px;
    right: 14px;
    bottom: auto;
    left: 14px;
    width: auto;
    height: 1px;
  }

  .preview-label {
    top: 14px;
    left: 14px;
  }

  .accent-options {
    width: 100%;
    grid-template-columns: repeat(2, minmax(82px, 1fr));
  }
}
</style>
