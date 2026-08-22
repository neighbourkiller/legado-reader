<template>
  <div
    class="home-wrapper"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- Background and overlay -->
    <div class="home-bg"></div>
    <div class="home-overlay"></div>

    <!-- Drag overlay -->
    <transition name="fade">
      <div v-if="isDragging" class="drag-drop-overlay">
        <div class="drag-drop-box">
          <el-icon class="drag-icon"><UploadFilled /></el-icon>
          <div class="drag-text">释放鼠标导入电子书 (支持 TXT / EPUB)</div>
        </div>
      </div>
    </transition>

    <!-- Top Header -->
    <header class="site-header">
      <nav class="header-nav">
        <a href="#menu" class="menu-btn" @click.prevent="showMenu = true">
          <span>MENU</span>
        </a>
      </nav>
    </header>

    <!-- Center Hero Banner -->
    <main class="banner-section">
      <div class="banner-inner">
        <header class="banner-header">
          <h1 class="banner-title">昨日邻家乞新火，晓窗分与读书灯</h1>
          <div class="banner-divider"></div>
        </header>

        <div class="banner-actions">
          <button class="nav-button next" @click="goToBookshelf">
            书架
          </button>
          <button class="nav-button next" @click="openBookSourceDialog">
            书源
          </button>
          <button class="nav-button next" @click="triggerBookUpload">
            传书
          </button>
          <button class="nav-button next" @click="openRssSourceDialog">
            订阅源
          </button>
        </div>
      </div>
    </main>

    <!-- Hidden file input for book upload -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".txt,.epub"
      multiple
      class="hidden-file-input"
      @change="handleFileSelect"
    />

    <!-- Slide-in Drawer Menu -->
    <el-drawer
      v-model="showMenu"
      direction="rtl"
      size="320px"
      :show-close="false"
      class="forty-menu-drawer"
      :with-header="false"
    >
      <div class="drawer-content">
        <div class="drawer-header">
          <button class="close-btn" @click="showMenu = false" aria-label="Close menu">
            &times;
          </button>
        </div>
        <ul class="drawer-links">
          <li>
            <a href="javascript:void(0)" @click="goTo('/')">首页</a>
          </li>
          <li>
            <a href="javascript:void(0)" @click="goTo('/bookshelf')">书架</a>
          </li>
          <li>
            <a href="javascript:void(0)" @click="triggerBookUploadAndCloseMenu">传书 / 导入书籍</a>
          </li>
          <li class="divider-li"></li>
          <li>
            <a href="https://github.com/neighbourkiller/legado" target="_blank" rel="noopener noreferrer">
              Github
            </a>
          </li>
          <li>
            <a href="https://github.com/zsakvo" target="_blank" rel="noopener noreferrer">
              zsakvo
            </a>
          </li>
          <li>
            <a href="https://html5up.net" target="_blank" rel="noopener noreferrer">
              Design: HTML5 UP
            </a>
          </li>
        </ul>
      </div>
    </el-drawer>

    <!-- Book Source Dialog -->
    <el-dialog
      v-model="showBookSourceModal"
      title="书源说明"
      width="480px"
      center
      align-center
      class="forty-dialog"
    >
      <div class="dialog-body">
        <p class="dialog-desc">
          当前模块为 <strong>Web 纯前端离线阅读器</strong>，专注于在浏览器中直接高速解析与离线阅读本地 <code>TXT</code> / <code>EPUB</code> 格式电子书。
        </p>
        <p class="dialog-desc">
          如需使用海量在线书源搜索、规则编写与网络换源功能，请在 <strong>Legado (开源阅读)</strong> Android 手机端配置使用或开启 Web 控制端服务。
        </p>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="showBookSourceModal = false">知道了</el-button>
          <a
            href="https://github.com/neighbourkiller/legado"
            target="_blank"
            rel="noopener noreferrer"
            class="dialog-link-btn"
          >
            访问 Legado Github
          </a>
        </div>
      </template>
    </el-dialog>

    <!-- RSS Source Dialog -->
    <el-dialog
      v-model="showRssSourceModal"
      title="订阅源说明"
      width="480px"
      center
      align-center
      class="forty-dialog"
    >
      <div class="dialog-body">
        <p class="dialog-desc">
          当前模块为 <strong>Web 纯前端阅读器</strong>，图书及进度均持久化保存在本地浏览器 IndexedDB 中。
        </p>
        <p class="dialog-desc">
          如需订阅 RSS 资讯与网络内容流，请配合 Legado Android 客户端使用。您可以通过主页「传书」按钮随时导入本地电子书进行沉浸阅读。
        </p>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="showRssSourceModal = false">知道了</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { useBookshelfStore } from '@/stores/bookshelf'

const router = useRouter()
const bookshelfStore = useBookshelfStore()

const showMenu = ref(false)
const showBookSourceModal = ref(false)
const showRssSourceModal = ref(false)
const isDragging = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

let dragCounter = 0

const goToBookshelf = () => {
  router.push('/bookshelf')
}

const openBookSourceDialog = () => {
  showBookSourceModal.value = true
}

const openRssSourceDialog = () => {
  showRssSourceModal.value = true
}

const triggerBookUpload = () => {
  fileInputRef.value?.click()
}

const triggerBookUploadAndCloseMenu = () => {
  showMenu.value = false
  triggerBookUpload()
}

const goTo = (path: string) => {
  showMenu.value = false
  router.push(path)
}

const onDragOver = (e: DragEvent) => {
  e.preventDefault()
  if (dragCounter === 0) {
    isDragging.value = true
  }
  dragCounter++
}

const onDragLeave = (e: DragEvent) => {
  e.preventDefault()
  dragCounter--
  if (dragCounter <= 0) {
    dragCounter = 0
    isDragging.value = false
  }
}

const onDrop = async (e: DragEvent) => {
  dragCounter = 0
  isDragging.value = false
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return

  await processFiles(Array.from(files))
}

const handleFileSelect = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const files = target.files
  if (!files || files.length === 0) return

  await processFiles(Array.from(files))
  target.value = ''
}

const processFiles = async (files: File[]) => {
  const validFiles = files.filter(f => {
    const ext = f.name.split('.').pop()?.toLowerCase()
    return ext === 'txt' || ext === 'epub'
  })

  if (validFiles.length === 0) {
    ElMessage.error('仅支持导入 TXT 和 EPUB 格式的小说文件')
    return
  }

  const loading = ElMessage({
    message: `正在导入 ${validFiles.length} 本书籍...`,
    type: 'info',
    duration: 0
  })

  try {
    for (const file of validFiles) {
      await bookshelfStore.parseAndImportBook(file)
    }
    loading.close()
    ElMessage.success('导入成功')
    router.push('/bookshelf')
  } catch (error) {
    loading.close()
    ElMessage.error('导入失败，请重试')
    console.error(error)
  }
}
</script>

<style scoped>
.home-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  background-color: #242943;
}

/* Background image & gradient overlay */
.home-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: url("/images/bg.jpg") no-repeat center center;
  background-size: cover;
  z-index: 1;
}

.home-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(rgba(17, 21, 37, 0.65), rgba(17, 21, 37, 0.65));
  z-index: 2;
}

/* Header */
.site-header {
  position: relative;
  z-index: 10;
  height: 3.5em;
  line-height: 3.5em;
  padding: 0 2em;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-shrink: 0;
}

.header-nav {
  display: flex;
  align-items: center;
}

.menu-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #ffffff;
  text-decoration: none;
  font-size: 0.8em;
  font-weight: 700;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  padding: 0.5em 0.75em;
  cursor: pointer;
  transition: color 0.2s ease-in-out;
  position: relative;
}

.menu-btn::after {
  content: '';
  display: inline-block;
  width: 24px;
  height: 32px;
  background-image: url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='32' viewBox='0 0 24 32' preserveAspectRatio='none'%3E%3Cstyle%3Eline %7B stroke-width: 2px%3B stroke: %23ffffff%3B %7D%3C/style%3E%3Cline x1='0' y1='11' x2='24' y2='11' /%3E%3Cline x1='0' y1='21' x2='24' y2='21' /%3E%3Cline x1='0' y1='16' x2='24' y2='16' /%3E%3C/svg%3E");
  background-position: center;
  background-repeat: no-repeat;
  background-size: 24px 32px;
  transition: background-image 0.2s ease-in-out;
}

.menu-btn:hover {
  color: #9bf1ff;
}

.menu-btn:hover::after {
  background-image: url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='32' viewBox='0 0 24 32' preserveAspectRatio='none'%3E%3Cstyle%3Eline %7B stroke-width: 2px%3B stroke: %239bf1ff%3B %7D%3C/style%3E%3Cline x1='0' y1='11' x2='24' y2='11' /%3E%3Cline x1='0' y1='21' x2='24' y2='21' /%3E%3Cline x1='0' y1='16' x2='24' y2='16' /%3E%3C/svg%3E");
}

/* Banner Section */
.banner-section {
  position: relative;
  z-index: 10;
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0 4em 3em 4em;
  max-width: 1280px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

.banner-inner {
  width: 100%;
}

.banner-header {
  margin-bottom: 2em;
}

.banner-title {
  font-size: 2.85rem;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: 0.05em;
  color: #ffffff;
  margin: 0 0 0.4em 0;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
}

.banner-divider {
  width: 100%;
  height: 2px;
  background-color: #ffffff;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.4);
}

/* Action Buttons */
.banner-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1.5em;
}

.nav-button {
  appearance: none;
  background-color: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: inset 0 0 0 2px #ffffff;
  color: #ffffff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  font-size: 0.85em;
  font-weight: 600;
  height: 3.5em;
  line-height: 3.5em;
  letter-spacing: 0.25em;
  padding: 0 4.5em 0 2em;
  position: relative;
  text-align: center;
  text-decoration: none;
  text-transform: uppercase;
  white-space: nowrap;
  transition: background-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out, color 0.2s ease-in-out;
}

.nav-button.next::before {
  content: '';
  position: absolute;
  right: 1.5em;
  top: 0;
  width: 36px;
  height: 100%;
  background-image: url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36px' height='24px' viewBox='0 0 36 24'%3E%3Cstyle%3Eline %7B stroke: %23ffffff%3B stroke-width: 2px%3B %7D%3C/style%3E%3Cline x1='0' y1='12' x2='34' y2='12' /%3E%3Cline x1='25' y1='4' x2='34' y2='12.5' /%3E%3Cline x1='25' y1='20' x2='34' y2='11.5' /%3E%3C/svg%3E");
  background-position: center right;
  background-repeat: no-repeat;
  background-size: 36px 24px;
  transition: opacity 0.2s ease-in-out;
}

.nav-button.next::after {
  content: '';
  position: absolute;
  right: 1.5em;
  top: 0;
  width: 36px;
  height: 100%;
  background-image: url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36px' height='24px' viewBox='0 0 36 24'%3E%3Cstyle%3Eline %7B stroke: %239bf1ff%3B stroke-width: 2px%3B %7D%3C/style%3E%3Cline x1='0' y1='12' x2='34' y2='12' /%3E%3Cline x1='25' y1='4' x2='34' y2='12.5' /%3E%3Cline x1='25' y1='20' x2='34' y2='11.5' /%3E%3C/svg%3E");
  background-position: center right;
  background-repeat: no-repeat;
  background-size: 36px 24px;
  opacity: 0;
  transition: opacity 0.2s ease-in-out;
}

.nav-button:hover {
  box-shadow: inset 0 0 0 2px #9bf1ff;
  color: #9bf1ff;
}

.nav-button:hover::after {
  opacity: 1;
}

.nav-button:active {
  background-color: rgba(155, 241, 255, 0.1);
  box-shadow: inset 0 0 0 2px #53e3fb;
  color: #53e3fb;
}

/* Hidden File Input */
.hidden-file-input {
  display: none;
}

/* Drag Drop Overlay */
.drag-drop-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(36, 41, 67, 0.85);
  backdrop-filter: blur(8px);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.drag-drop-box {
  padding: 40px 60px;
  border: 2px dashed #9bf1ff;
  border-radius: 8px;
  text-align: center;
  background: rgba(17, 21, 37, 0.8);
}

.drag-icon {
  font-size: 64px;
  color: #9bf1ff;
  margin-bottom: 16px;
}

.drag-text {
  font-size: 20px;
  color: #ffffff;
  letter-spacing: 0.1em;
}

/* Drawer Styling */
:deep(.forty-menu-drawer) {
  background-color: rgba(36, 41, 67, 0.96) !important;
  backdrop-filter: blur(12px);
}

.drawer-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 2.5em 2em;
  box-sizing: border-box;
}

.drawer-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 2em;
}

.close-btn {
  background: transparent;
  border: 0;
  color: #ffffff;
  font-size: 2.5rem;
  line-height: 1;
  cursor: pointer;
  transition: color 0.2s ease-in-out;
}

.close-btn:hover {
  color: #9bf1ff;
}

.drawer-links {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 1.25em;
}

.drawer-links li a {
  color: #ffffff;
  text-decoration: none;
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: 0.15em;
  transition: color 0.2s ease-in-out;
  display: block;
  padding: 0.25em 0;
}

.drawer-links li a:hover {
  color: #9bf1ff;
}

.divider-li {
  height: 1px;
  background-color: rgba(255, 255, 255, 0.15);
  margin: 0.5em 0;
}

/* Dialogs */
.dialog-desc {
  font-size: 15px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  margin-bottom: 12px;
}

.dialog-desc code {
  background: var(--el-fill-color);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: bold;
}

.dialog-footer {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
}

.dialog-link-btn {
  font-size: 14px;
  color: var(--el-color-primary);
  text-decoration: none;
}

.dialog-link-btn:hover {
  text-decoration: underline;
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Responsive Media Queries */
@media screen and (max-width: 980px) {
  .banner-section {
    padding: 0 2.5em 3em 2.5em;
  }
  
  .banner-title {
    font-size: 2.25rem;
  }
}

@media screen and (max-width: 736px) {
  .site-header {
    padding: 0 1.25em;
  }

  .banner-section {
    padding: 0 1.5em 2em 1.5em;
  }

  .banner-title {
    font-size: 1.65rem;
    line-height: 1.35;
  }

  .banner-actions {
    gap: 1em;
  }

  .nav-button {
    width: 100%;
    justify-content: center;
    padding: 0 4em 0 2em;
  }
}
</style>

