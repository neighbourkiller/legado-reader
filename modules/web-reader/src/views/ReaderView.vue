<template>
  <div 
    class="reader-container"
    :style="readerStyle"
    @click="toggleControls"
  >
    <!-- Content Area -->
    <div class="reader-content-scroll">
      <div 
        class="reader-content" 
        :style="contentStyle"
        v-html="formattedContent"
      ></div>
    </div>

    <!-- Top Bar -->
    <transition name="slide-down">
      <div v-show="showControls" class="top-bar" @click.stop>
        <div class="left">
          <el-button :icon="ArrowLeft" circle @click="router.back()" />
          <span class="book-title">{{ currentBook?.name }}</span>
        </div>
        <div class="right">
          <span class="progress">第 {{ (currentBook?.currentChapter || 0) + 1 }} / {{ currentBook?.totalChapters || 1 }} 章</span>
          <el-button :icon="Menu" circle @click="showChapterList = true" />
        </div>
      </div>
    </transition>

    <!-- Bottom Bar -->
    <transition name="slide-up">
      <div v-show="showControls" class="bottom-bar" @click.stop>
        <el-button @click="handlePrev" :disabled="isFirstChapter">上一章</el-button>
        <el-button :icon="Setting" circle @click="showSettings = true" />
        <el-button @click="handleNext" :disabled="isLastChapter">下一章</el-button>
      </div>
    </transition>

    <!-- Chapter List Drawer -->
    <el-drawer
      v-model="showChapterList"
      title="目录"
      direction="ltr"
      size="300px"
      :with-header="true"
    >
      <div class="chapter-list">
        <div 
          v-for="(chapter, index) in chapters" 
          :key="index"
          class="chapter-item"
          :class="{ active: currentBook?.currentChapter === index }"
          @click="goToChapter(index)"
        >
          {{ chapter.title }}
        </div>
      </div>
    </el-drawer>

    <!-- Settings Drawer -->
    <el-drawer
      v-model="showSettings"
      title="阅读设置"
      direction="btt"
      size="300px"
    >
      <div class="settings-content">
        <div class="setting-item">
          <span class="label">字号</span>
          <el-slider v-model="settings.fontSize" :min="14" :max="32" :step="2" @change="watchSettings" />
          <span class="value">{{ settings.fontSize }}px</span>
        </div>
        
        <div class="setting-item">
          <span class="label">行高</span>
          <el-slider v-model="settings.lineHeight" :min="1.5" :max="3.0" :step="0.1" @change="watchSettings" />
          <span class="value">{{ settings.lineHeight }}</span>
        </div>

        <div class="setting-item">
          <span class="label">字体</span>
          <el-select v-model="settings.fontFamily" placeholder="选择字体" size="small">
            <el-option label="系统默认" value="system-ui, -apple-system, sans-serif" />
            <el-option label="宋体" value="'SimSun', 'STSong', serif" />
            <el-option label="黑体" value="'SimHei', 'STHeiti', sans-serif" />
          </el-select>
        </div>

        <div class="setting-item">
          <span class="label">主题</span>
          <div class="theme-buttons">
            <div class="theme-btn white" @click="setTheme('#ffffff', '#333333')">白</div>
            <div class="theme-btn sepia" @click="setTheme('#e8e4d9', '#333333')">护</div>
            <div class="theme-btn dark" @click="setTheme('#1a1a1a', '#eeeeee')">夜</div>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { ArrowLeft, Menu, Setting } from '@element-plus/icons-vue'
import { useReadingStore } from '@/stores/reading'
import { ElMessage } from 'element-plus'

const route = useRoute()
const router = useRouter()
const readingStore = useReadingStore()

const showControls = ref(false)
const showChapterList = ref(false)
const showSettings = ref(false)

const { currentBook, chapters, settings } = storeToRefs(readingStore)

const isFirstChapter = computed(() => (currentBook.value?.currentChapter || 0) <= 0)
const isLastChapter = computed(() => (currentBook.value?.currentChapter || 0) >= (currentBook.value?.totalChapters || 1) - 1)

onMounted(async () => {
  const bookId = route.params.id as string
  if (bookId) {
    try {
      await readingStore.loadBook(bookId)
    } catch (e) {
      ElMessage.error('加载书籍失败')
      router.push('/bookshelf')
    }
  }
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  readingStore.saveProgress()
  readingStore.cleanup()
  window.removeEventListener('keydown', handleKeydown)
})

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'ArrowLeft') {
    handlePrev()
  } else if (e.key === 'ArrowRight') {
    handleNext()
  }
}

const toggleControls = () => {
  showControls.value = !showControls.value
  if (!showControls.value) {
    showSettings.value = false
  }
}

const handlePrev = async () => {
  if (isFirstChapter.value) return
  await readingStore.saveProgress()
  await readingStore.prevChapter()
  scrollToTop()
}

const handleNext = async () => {
  if (isLastChapter.value) return
  await readingStore.saveProgress()
  await readingStore.nextChapter()
  scrollToTop()
}

const goToChapter = async (index: number) => {
  await readingStore.saveProgress()
  await readingStore.loadChapter(index)
  showChapterList.value = false
  showControls.value = false
  scrollToTop()
}

const scrollToTop = () => {
  const scrollContainer = document.querySelector('.reader-content-scroll')
  if (scrollContainer) {
    scrollContainer.scrollTop = 0
  }
}

const setTheme = (bg: string, text: string) => {
  readingStore.updateSettings({ backgroundColor: bg, textColor: text })
}

// Also persist font/line-height changes with a debounce
let settingsTimer: ReturnType<typeof setTimeout> | null = null
const watchSettings = () => {
  if (settingsTimer) clearTimeout(settingsTimer)
  settingsTimer = setTimeout(() => {
    readingStore.updateSettings({ ...settings.value })
  }, 500)
}

const formattedContent = computed(() => {
  const raw = readingStore.currentContent
  if (!raw) return ''
  if (currentBook.value?.format === 'epub') {
    return raw
  }
  const paragraphs = raw.split(/\n+/).map(p => p.trim()).filter(p => p)
  return paragraphs.map(p => `<p>${p}</p>`).join('')
})

const readerStyle = computed(() => ({
  backgroundColor: settings.value?.backgroundColor || '#ffffff',
  color: settings.value?.textColor || '#333333',
  fontFamily: settings.value?.fontFamily || 'system-ui'
}))

const contentStyle = computed(() => ({
  fontSize: `${settings.value?.fontSize || 18}px`,
  lineHeight: settings.value?.lineHeight || 1.8
}))
</script>

<style scoped>
.reader-container {
  height: 100vh;
  width: 100vw;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 999;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.reader-content-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 20px;
}

.reader-content {
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 0 100px 0;
  text-align: justify;
}

:deep(.reader-content p) {
  text-indent: 2em;
  margin: 0.5em 0;
  word-break: break-all;
}

.top-bar, .bottom-bar {
  position: absolute;
  left: 0;
  right: 0;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  box-shadow: 0 2px 12px 0 rgba(0,0,0,0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  height: 56px;
  z-index: 1000;
}

.top-bar {
  top: 0;
}

.bottom-bar {
  bottom: 0;
  box-shadow: 0 -2px 12px 0 rgba(0,0,0,0.1);
}

.top-bar .left, .top-bar .right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.book-title {
  font-weight: bold;
}

.progress {
  font-size: 14px;
}

.slide-down-enter-active, .slide-down-leave-active,
.slide-up-enter-active, .slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from, .slide-down-leave-to {
  transform: translateY(-100%);
}

.slide-up-enter-from, .slide-up-leave-to {
  transform: translateY(100%);
}

.chapter-list {
  padding: 0 16px;
}

.chapter-item {
  padding: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chapter-item:hover {
  background-color: var(--el-fill-color-light);
}

.chapter-item.active {
  color: var(--el-color-primary);
  font-weight: bold;
}

.settings-content {
  padding: 0 20px;
}

.setting-item {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.setting-item .label {
  width: 40px;
  flex-shrink: 0;
  font-size: 14px;
}

.setting-item .value {
  width: 40px;
  text-align: right;
  font-size: 14px;
}

.setting-item .el-slider {
  flex: 1;
}

.theme-buttons {
  display: flex;
  gap: 16px;
}

.theme-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 1px solid #ddd;
  font-size: 14px;
}

.theme-btn.white {
  background: #ffffff;
  color: #333333;
}
.theme-btn.sepia {
  background: #e8e4d9;
  color: #333333;
}
.theme-btn.dark {
  background: #1a1a1a;
  color: #eeeeee;
  border-color: #333;
}
</style>
