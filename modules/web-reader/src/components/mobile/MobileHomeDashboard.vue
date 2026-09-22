<script setup lang="ts">
import { computed, onMounted, shallowRef, useTemplateRef } from 'vue'
import { Moon, Plus, Sunny } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { useBookshelfStore } from '@/stores/bookshelf'
import { useBookImport } from '@/composables/useBookImport'
import { useTheme } from '@/composables/useTheme'
import { useThemeController } from '@/composables/useThemeController'
import { selectMostRecentBook } from '@/mobile/mobileHome'
import MobileRecentReadingCard from './MobileRecentReadingCard.vue'

const router = useRouter()
const bookshelfStore = useBookshelfStore()
const { isDark } = useTheme()
const { requestTheme } = useThemeController()
const { isImporting, importFiles } = useBookImport()

const fileInputRef = useTemplateRef<HTMLInputElement>('fileInput')
const loadError = shallowRef('')

const recentBook = computed(() => selectMostRecentBook(bookshelfStore.books))

const loadBooks = async () => {
  loadError.value = ''
  try {
    await bookshelfStore.loadBooks()
  } catch (error) {
    console.error(error)
    loadError.value = '书架加载失败，请稍后重试'
  }
}

onMounted(loadBooks)

const toggleTheme = () => requestTheme(isDark.value ? 'light' : 'dark')
const triggerImport = () => fileInputRef.value?.click()

const handleFileSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files?.length) await importFiles(input.files)
  input.value = ''
}

const goToBookshelf = () => {
  void router.push('/bookshelf')
}

const continueReading = (id: string) => {
  void router.push(`/reader/${id}`)
}
</script>

<template>
  <main class="mobile-home-dashboard">
    <header class="mobile-home-dashboard__header">
      <div>
        <h1>阅读</h1>
        <p>清风不识字，何故乱翻书。</p>
      </div>
      <div class="mobile-home-dashboard__header-actions">
        <button
          type="button"
          :aria-label="isDark ? '切换为浅色模式' : '切换为深色模式'"
          @click="toggleTheme"
        >
          <el-icon><Moon v-if="isDark" /><Sunny v-else /></el-icon>
        </button>
      </div>
    </header>

    <div v-if="bookshelfStore.isLoading" class="mobile-home-dashboard__loading" aria-live="polite">
      <span></span><span></span><span></span>
      <p>正在整理书架…</p>
    </div>

    <section v-else-if="loadError" class="mobile-home-dashboard__empty" aria-live="assertive">
      <h2>暂时无法打开书架</h2>
      <p>{{ loadError }}</p>
      <button type="button" @click="loadBooks">重新加载</button>
    </section>

    <section v-else-if="bookshelfStore.books.length === 0" class="mobile-home-dashboard__empty">
      <div class="mobile-home-dashboard__empty-mark" aria-hidden="true">书</div>
      <h2>从一本书开始</h2>
      <p>导入本地 TXT 或 EPUB，阅读进度只保存在当前浏览器。</p>
      <button type="button" :disabled="isImporting" @click="triggerImport">
        <el-icon><Plus /></el-icon>
        导入第一本书
      </button>
    </section>

    <template v-else-if="recentBook">
      <section class="mobile-home-dashboard__section">
        <div class="mobile-home-dashboard__section-heading">
          <h2>最近阅读</h2>
          <button type="button" @click="goToBookshelf">查看书架</button>
        </div>
        <MobileRecentReadingCard :book="recentBook" @continue="continueReading" />
      </section>
    </template>

    <input
      ref="fileInput"
      class="mobile-home-dashboard__file-input"
      type="file"
      accept=".txt,.epub"
      multiple
      @change="handleFileSelect"
    />
  </main>
</template>

<style scoped>
.mobile-home-dashboard {
  width: 100%;
  max-width: 560px;
  min-height: calc(100vh - var(--mobile-primary-nav-total-height));
  min-height: calc(100dvh - var(--mobile-primary-nav-total-height));
  margin: 0 auto;
  padding: calc(18px + env(safe-area-inset-top, 0px)) 16px 28px;
  color: var(--mobile-text);
  background:
    radial-gradient(circle at 85% 0, rgba(var(--legado-primary-rgb), 0.09), transparent 30%),
    var(--mobile-bg);
}

.mobile-home-dashboard__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.mobile-home-dashboard__header h1 {
  margin: 0;
  font-size: 30px;
  font-weight: 760;
  line-height: 1.2;
  letter-spacing: -0.035em;
}

.mobile-home-dashboard__header p {
  margin: 6px 0 0;
  color: var(--mobile-text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.mobile-home-dashboard__header-actions {
  display: flex;
  gap: 8px;
}

.mobile-home-dashboard__header-actions button {
  display: grid;
  width: 44px;
  height: 44px;
  padding: 0;
  place-items: center;
  border: 1px solid var(--mobile-border);
  border-radius: 50%;
  color: var(--mobile-text);
  background: var(--mobile-surface-raised);
  font-size: 21px;
  cursor: pointer;
}

.mobile-home-dashboard__header-actions button:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.mobile-home-dashboard__section {
  margin-top: 30px;
}

.mobile-home-dashboard__section-heading {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 10px;
}

.mobile-home-dashboard__section-heading h2 {
  margin: 0;
  color: var(--mobile-text);
  font-size: 20px;
  font-weight: 720;
  letter-spacing: -0.02em;
}

.mobile-home-dashboard__section-heading > button {
  min-height: 44px;
  padding: 0 2px 0 14px;
  border: 0;
  color: var(--mobile-text-muted);
  background: transparent;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.mobile-home-dashboard__empty button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 14px;
  border: 0;
  border-radius: 12px;
  color: #fff;
  background: var(--el-color-primary);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.mobile-home-dashboard__empty button:disabled {
  cursor: wait;
  opacity: 0.62;
}

.mobile-home-dashboard__loading,
.mobile-home-dashboard__empty {
  display: flex;
  min-height: 280px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 22px;
  text-align: center;
}

.mobile-home-dashboard__empty {
  min-height: calc(100dvh - 210px - var(--mobile-primary-nav-total-height));
}

.mobile-home-dashboard__empty-mark {
  display: grid;
  width: 68px;
  height: 82px;
  margin-bottom: 18px;
  place-items: center;
  border: 1px solid var(--mobile-border);
  border-radius: 7px 14px 14px 7px;
  color: var(--el-color-primary);
  background: var(--mobile-surface);
  box-shadow: var(--mobile-shadow);
  font-size: 22px;
  font-weight: 700;
}

.mobile-home-dashboard__empty h2 {
  margin: 0;
  font-size: 21px;
}

.mobile-home-dashboard__empty p,
.mobile-home-dashboard__loading p {
  max-width: 290px;
  margin: 9px 0 18px;
  color: var(--mobile-text-muted);
  font-size: 13px;
  line-height: 1.65;
}

.mobile-home-dashboard__loading span {
  width: min(100%, 360px);
  height: 14px;
  margin-bottom: 10px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--mobile-surface) 20%, var(--mobile-surface-raised) 50%, var(--mobile-surface) 80%);
  background-size: 220% 100%;
  animation: mobile-home-loading 1.3s linear infinite;
}

.mobile-home-dashboard__loading span:nth-child(2) {
  width: min(78%, 280px);
}

.mobile-home-dashboard__loading span:nth-child(3) {
  width: min(58%, 210px);
}

.mobile-home-dashboard__file-input {
  display: none;
}

@keyframes mobile-home-loading {
  to {
    background-position: -220% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mobile-home-dashboard__loading span {
    animation: none;
  }
}
</style>
