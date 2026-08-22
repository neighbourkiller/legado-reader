<template>
  <div class="theme-toggle-segmented" :class="{ dark: isDark }">
    <button
      type="button"
      class="toggle-btn"
      :class="{ active: themeMode === 'auto' }"
      title="跟随系统"
      aria-label="跟随系统"
      @click="setTheme('auto')"
    >
      <svg class="toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
        <line x1="8" y1="21" x2="16" y2="21"></line>
        <line x1="12" y1="17" x2="12" y2="21"></line>
      </svg>
    </button>

    <button
      type="button"
      class="toggle-btn"
      :class="{ active: themeMode === 'light' }"
      title="浅色模式"
      aria-label="浅色模式"
      @click="setTheme('light')"
    >
      <svg class="toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      </svg>
    </button>

    <button
      type="button"
      class="toggle-btn"
      :class="{ active: themeMode === 'dark' }"
      title="暗黑模式"
      aria-label="暗黑模式"
      @click="setTheme('dark')"
    >
      <svg class="toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useTheme } from '@/composables/useTheme'

const { themeMode, isDark, setTheme } = useTheme()
</script>

<style scoped>
.theme-toggle-segmented {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 8px;
  background-color: rgba(0, 0, 0, 0.06);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-sizing: border-box;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.theme-toggle-segmented.dark {
  background-color: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.1);
}

.toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  color: #888888;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle-btn:hover {
  color: #333333;
}

.theme-toggle-segmented.dark .toggle-btn:hover {
  color: #d0d0d0;
}

.toggle-btn.active {
  background-color: #ffffff;
  color: #222222;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.theme-toggle-segmented.dark .toggle-btn.active {
  background-color: #3d3d3d;
  color: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}

.toggle-icon {
  width: 16px;
  height: 16px;
  display: block;
}
</style>
