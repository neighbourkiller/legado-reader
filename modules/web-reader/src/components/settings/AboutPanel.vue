<template>
  <div class="about-panel">
    <div class="about-card">
      <div class="app-mark">阅</div>
      <div class="app-copy">
        <h3>Legado 阅读</h3>
        <p>Tauri 2 + Vue 3 桌面客户端</p>
        <span>版本 {{ packageInfo.version }}</span>
      </div>
    </div>

    <div class="about-details">
      <div><span>客户端类型</span><strong>{{ clientType }}</strong></div>
      <div><span>数据存储</span><strong>本地 IndexedDB</strong></div>
      <div><span>项目许可</span><strong>GPL-3.0</strong></div>
    </div>

    <div class="about-actions">
      <el-button type="primary" @click="openProject">访问项目主页</el-button>
      <el-button @click="openIssues">反馈问题</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import packageInfo from '../../../package.json'
import { openExternalUrl } from '@/platform/externalBrowser'

const clientType = import.meta.env.VITE_APP_TARGET === 'desktop' ? 'Tauri 桌面客户端' : 'Web 客户端'
const openProject = () => openExternalUrl('https://github.com/neighbourkiller/legado-reader')
const openIssues = () => openExternalUrl('https://github.com/neighbourkiller/legado-reader/issues')
</script>

<style scoped>
.about-panel { max-width: 720px; margin-top: 24px; }
.about-card { display: flex; align-items: center; gap: 18px; padding: 24px; border: 1px solid var(--el-border-color-lighter); border-radius: 12px; background: var(--el-bg-color-overlay); }
.app-mark { display: flex; align-items: center; justify-content: center; width: 72px; height: 72px; border-radius: 18px; color: white; background: var(--el-color-primary); font-size: 34px; font-weight: 700; }
.app-copy h3 { margin: 0 0 7px; font-size: 23px; }
.app-copy p { margin: 0 0 7px; color: var(--el-text-color-regular); }
.app-copy span { color: var(--el-text-color-secondary); font-size: 13px; }
.about-details { margin-top: 18px; overflow: hidden; border: 1px solid var(--el-border-color-lighter); border-radius: 10px; background: var(--el-bg-color-overlay); }
.about-details > div { display: flex; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--el-border-color-lighter); }
.about-details > div:last-child { border-bottom: 0; }
.about-details span { color: var(--el-text-color-secondary); }
.about-details strong { font-weight: 500; }
.about-actions { display: flex; gap: 10px; margin-top: 18px; }
</style>
