<template>
  <div
    class="reader-floating-dock-container"
    :class="{
      hidden: !visible,
      night: isNight,
      day: !isNight,
    }"
    :aria-hidden="!visible"
    :inert="!visible"
    :style="dockStyle"
    @click.stop
  >
    <div class="reader-floating-dock" role="toolbar" aria-label="阅读控制栏">
      <!-- 返回书架 -->
      <button
        type="button"
        class="dock-item"
        title="返回书架"
        @click="emit('to-shelf')"
      >
        <el-icon class="dock-icon"><HomeFilled /></el-icon>
        <span class="dock-label">书架</span>
      </button>

      <div class="dock-divider"></div>

      <!-- 目录 slot / 默认按钮 -->
      <slot name="catalog-trigger">
        <button
          type="button"
          class="dock-item"
          title="目录"
          @click="emit('toggle-catalog')"
        >
          <el-icon class="dock-icon"><List /></el-icon>
          <span class="dock-label">目录</span>
        </button>
      </slot>

      <!-- 排版设置 slot / 默认按钮 -->
      <slot name="settings-trigger">
        <button
          type="button"
          class="dock-item"
          title="排版与设置"
          @click="emit('toggle-settings')"
        >
          <el-icon class="dock-icon"><IconPalette /></el-icon>
          <span class="dock-label">设置</span>
        </button>
      </slot>

      <!-- 书签管理入口 -->
      <button
        type="button"
        class="dock-item"
        :class="{ active: isBookmarked }"
        title="打开本书书签管理"
        aria-label="打开本书书签管理"
        @click="emit('open-bookmarks-drawer')"
      >
        <el-icon class="dock-icon"><BookmarkIcon /></el-icon>
        <span class="dock-label">书签</span>
      </button>

      <div class="dock-divider"></div>

      <!-- 上一章 -->
      <button
        type="button"
        class="dock-item dock-item-arrow"
        :class="{ disabled: isFirstChapter }"
        :disabled="isFirstChapter"
        title="上一章"
        @click="emit('prev-chapter')"
      >
        <el-icon class="dock-icon"><ArrowLeft /></el-icon>
      </button>

      <!-- 下一章 -->
      <button
        type="button"
        class="dock-item dock-item-arrow"
        :class="{ disabled: isLastChapter }"
        :disabled="isLastChapter"
        title="下一章"
        @click="emit('next-chapter')"
      >
        <el-icon class="dock-icon"><ArrowRight /></el-icon>
      </button>

      <div class="dock-divider"></div>

      <!-- 更多低频操作下拉菜单 -->
      <el-dropdown
        ref="moreDropdownRef"
        trigger="click"
        placement="top-end"
        :popper-class="['reader-more-dropdown-popper', isNight ? 'is-night' : 'is-day']"
        @visible-change="handleMoreVisibleChange"
        @command="handleMoreCommand"
      >
        <button type="button" class="dock-item" title="更多操作">
          <el-icon class="dock-icon"><MoreFilled /></el-icon>
          <span class="dock-label">更多</span>
        </button>
        <template #dropdown>
          <el-dropdown-menu class="reader-more-menu">
            <el-dropdown-item command="bookmarks-drawer">
              <el-icon><CollectionTag /></el-icon>
              <span>书签与划线管理</span>
            </el-dropdown-item>
            <el-dropdown-item
              command="refresh"
              :disabled="chapterLoading"
              divided
            >
              <el-icon><RefreshIcon /></el-icon>
              <span>重新加载本章</span>
            </el-dropdown-item>
            <el-dropdown-item
              v-if="isOnlineBook"
              command="download"
            >
              <el-icon><DownloadIcon /></el-icon>
              <span>离线下载章节</span>
            </el-dropdown-item>
            <el-dropdown-item
              v-if="canOpenBookDetail"
              command="detail"
            >
              <el-icon><DetailIcon /></el-icon>
              <span>书籍详情</span>
            </el-dropdown-item>
            <el-dropdown-item command="fullscreen" divided>
              <el-icon><FullScreen /></el-icon>
              <span>{{ isFullscreen ? '退出全屏 (ESC)' : '全屏阅读 (F11)' }}</span>
            </el-dropdown-item>
            <el-dropdown-item command="to-top">
              <el-icon><Top /></el-icon>
              <span>回到顶部</span>
            </el-dropdown-item>
            <el-dropdown-item command="to-bottom">
              <el-icon><Bottom /></el-icon>
              <span>到达底部</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DropdownInstance } from 'element-plus'
import {
  HomeFilled,
  List,
  Management as BookmarkIcon,
  ArrowLeft,
  ArrowRight,
  MoreFilled,
  CollectionTag,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  Document as DetailIcon,
  FullScreen,
  Top,
  Bottom,
} from '@element-plus/icons-vue'
import IconPalette from './icons/IconPalette.vue'
import {
  READER_DOCK_HEIGHT_MAX,
  READER_DOCK_HEIGHT_MIN,
} from '@/reader/readerLayoutSettings'

interface Props {
  visible: boolean
  isFirstChapter?: boolean
  isLastChapter?: boolean
  isBookmarked?: boolean
  canOpenBookDetail?: boolean
  chapterLoading?: boolean
  isOnlineBook?: boolean
  isFullscreen?: boolean
  isNight?: boolean
  height?: number
}

const props = withDefaults(defineProps<Props>(), {
  visible: true,
  isFirstChapter: false,
  isLastChapter: false,
  isBookmarked: false,
  canOpenBookDetail: true,
  chapterLoading: false,
  isOnlineBook: false,
  isFullscreen: false,
  isNight: false,
  height: 64,
})

const resolveDockDimensions = (requestedHeight: number) => {
  const normalizedHeight = Number.isFinite(requestedHeight) ? requestedHeight : 64
  const height = Math.min(
    READER_DOCK_HEIGHT_MAX,
    Math.max(READER_DOCK_HEIGHT_MIN, normalizedHeight),
  )
  const scale = (height - READER_DOCK_HEIGHT_MIN)
    / (READER_DOCK_HEIGHT_MAX - READER_DOCK_HEIGHT_MIN)
  return {
    '--reader-dock-height': `${height}px`,
    '--reader-dock-item-height': `${height - 12}px`,
    '--reader-dock-icon-size': `${18 + scale * 6}px`,
    '--reader-dock-label-size': `${10 + scale * 2}px`,
    '--reader-dock-divider-height': `${22 + scale * 12}px`,
  }
}

const dockStyle = computed(() => resolveDockDimensions(props.height))

const emit = defineEmits<{
  'to-shelf': []
  'toggle-catalog': []
  'toggle-settings': []
  'prev-chapter': []
  'next-chapter': []
  'refresh-chapter': []
  'download': []
  'to-book-detail': []
  'toggle-fullscreen': []
  'to-top': []
  'to-bottom': []
  'open-bookmarks-drawer': []
  'more-menu-visible-change': [visible: boolean]
}>()

const moreDropdownRef = ref<DropdownInstance>()
const moreMenuVisible = ref(false)

const handleMoreVisibleChange = (val: boolean) => {
  moreMenuVisible.value = val
  emit('more-menu-visible-change', val)
}

// 当 dock 栏隐藏时，如果更多菜单处于展开状态，则主动关闭下拉菜单
watch(
  () => props.visible,
  (newVal) => {
    if (!newVal && moreMenuVisible.value) {
      moreDropdownRef.value?.handleClose()
    }
  },
)

const handleMoreCommand = (command: string) => {
  switch (command) {
    case 'bookmarks-drawer':
      emit('open-bookmarks-drawer')
      break
    case 'refresh':
      emit('refresh-chapter')
      break
    case 'download':
      emit('download')
      break
    case 'detail':
      emit('to-book-detail')
      break
    case 'fullscreen':
      emit('toggle-fullscreen')
      break
    case 'to-top':
      emit('to-top')
      break
    case 'to-bottom':
      emit('to-bottom')
      break
  }
}
</script>

<style scoped>
.reader-floating-dock-container {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%) translateY(0) scale(1);
  z-index: 1000;
  opacity: 1;
  transition: transform 0.24s cubic-bezier(0.2, 0.9, 0.3, 1),
              opacity 0.18s ease;
  pointer-events: auto;
  user-select: none;
}

.reader-floating-dock-container.hidden {
  opacity: 0;
  transform: translateX(-50%) translateY(18px) scale(0.96);
  pointer-events: none;
}

.reader-floating-dock-container.day {
  --dock-glass-background: linear-gradient(135deg, rgba(255, 255, 255, 0.72), rgba(245, 239, 227, 0.5));
  --dock-glass-background-solid: rgba(250, 247, 240, 0.96);
  --dock-glass-border: rgba(255, 255, 255, 0.78);
  --dock-glass-highlight: rgba(255, 255, 255, 0.95);
  --dock-glass-shadow: 0 18px 48px rgba(74, 63, 45, 0.18),
                       0 4px 14px rgba(74, 63, 45, 0.1),
                       inset 0 1px 0 rgba(255, 255, 255, 0.88),
                       inset 0 -1px 0 rgba(83, 68, 42, 0.08);
  --dock-text-color: #2c2925;
  --dock-focus-ring: rgba(91, 83, 70, 0.48);
  --dock-hover-background: rgba(75, 67, 55, 0.1);
  --dock-divider-color: rgba(76, 67, 54, 0.16);
}

.reader-floating-dock-container.night {
  --dock-glass-background: linear-gradient(135deg, rgba(50, 50, 55, 0.72), rgba(20, 20, 24, 0.58));
  --dock-glass-background-solid: rgba(29, 29, 33, 0.96);
  --dock-glass-border: rgba(255, 255, 255, 0.16);
  --dock-glass-highlight: rgba(255, 255, 255, 0.42);
  --dock-glass-shadow: 0 20px 54px rgba(0, 0, 0, 0.48),
                       0 5px 16px rgba(0, 0, 0, 0.3),
                       inset 0 1px 0 rgba(255, 255, 255, 0.14),
                       inset 0 -1px 0 rgba(0, 0, 0, 0.28);
  --dock-text-color: #ecebe8;
  --dock-focus-ring: rgba(236, 235, 232, 0.52);
  --dock-hover-background: rgba(255, 255, 255, 0.11);
  --dock-divider-color: rgba(255, 255, 255, 0.14);
}

.reader-floating-dock {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  height: var(--reader-dock-height, 64px);
  padding: 5px 12px;
  box-sizing: border-box;
  overflow: hidden;
  color: var(--dock-text-color);
  background: var(--dock-glass-background);
  border: 1px solid var(--dock-glass-border);
  border-radius: 9999px;
  box-shadow: var(--dock-glass-shadow);
  backdrop-filter: blur(26px) saturate(145%);
  -webkit-backdrop-filter: blur(26px) saturate(145%);
  transition: background-color 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
}

.reader-floating-dock::before {
  position: absolute;
  top: 0;
  left: 12%;
  width: 76%;
  height: 1px;
  content: '';
  pointer-events: none;
  background: linear-gradient(90deg, transparent, var(--dock-glass-highlight), transparent);
}

.dock-item,
:slotted(.dock-item) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: var(--reader-dock-item-height, 52px);
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  border-radius: 12px;
  cursor: pointer;
  outline: none;
  transition: background-color 0.18s ease, transform 0.18s ease, color 0.18s ease;
}

.dock-item-arrow,
:slotted(.dock-item-arrow) {
  width: 40px;
}

.dock-item:hover:not(:disabled),
:slotted(.dock-item:hover:not(:disabled)) {
  background: var(--dock-hover-background);
  transform: translateY(-1px);
}

.dock-item:focus-visible,
:slotted(.dock-item:focus-visible) {
  background: var(--dock-hover-background);
  box-shadow: inset 0 0 0 2px var(--dock-focus-ring);
}

.dock-item:active:not(:disabled),
:slotted(.dock-item:active:not(:disabled)) {
  transform: translateY(1px);
}

.dock-item.active,
:slotted(.dock-item.active) {
  color: #f59e0b;
}

.night .dock-item.active,
.night :slotted(.dock-item.active) {
  color: #fbbf24;
}

.dock-item.disabled,
.dock-item:disabled,
:slotted(.dock-item.disabled),
:slotted(.dock-item:disabled) {
  opacity: 0.32;
  cursor: not-allowed;
}

.dock-icon,
:slotted(.dock-icon) {
  font-size: var(--reader-dock-icon-size, 19.5px);
  line-height: 1;
}

.dock-text-icon,
:slotted(.dock-text-icon) {
  font-size: 16px;
  font-weight: 700;
  font-family: ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif;
  line-height: 1.1;
  letter-spacing: -0.5px;
}

.dock-label,
:slotted(.dock-label) {
  margin-top: 3px;
  font-size: var(--reader-dock-label-size, 10.5px);
  line-height: 1;
  font-weight: 500;
  opacity: 0.85;
}

.dock-divider {
  width: 1px;
  height: var(--reader-dock-divider-height, 25px);
  margin: 0 4px;
  background: var(--dock-divider-color);
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .reader-floating-dock {
    background: var(--dock-glass-background-solid);
  }
}

@media (prefers-reduced-motion: reduce) {
  .reader-floating-dock-container,
  .reader-floating-dock,
  .dock-item,
  :slotted(.dock-item) {
    transition: none;
  }
}

@media screen and (max-width: 768px) {
  .reader-floating-dock-container {
    bottom: 16px;
    width: calc(100vw - 24px);
  }

  .reader-floating-dock {
    justify-content: space-around;
    padding: 5px 6px;
  }

  .dock-item {
    width: auto;
    flex: 1;
    min-width: 0;
    height: var(--reader-dock-item-height, 52px);
  }

  .dock-item-arrow {
    flex: 0.8;
  }

  .dock-label {
    font-size: 10px;
  }
}
</style>

<style>
/* 下拉菜单全局弹窗定制 */
.reader-more-dropdown-popper {
  --el-dropdown-menu-box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
}

.reader-more-menu {
  border-radius: 14px !important;
  padding: 6px !important;
}

.reader-more-menu .el-dropdown-menu__item {
  border-radius: 8px !important;
  padding: 8px 14px !important;
  font-size: 13px !important;
  gap: 10px !important;
  transition: background-color 0.15s ease, color 0.15s ease !important;
}

/* 白天浅色模式下拉菜单 */
.reader-more-dropdown-popper.is-day .el-dropdown-menu {
  background-color: #ffffff !important;
  border: 1px solid rgba(0, 0, 0, 0.08) !important;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.12) !important;
}

.reader-more-dropdown-popper.is-day .el-dropdown-menu__item {
  color: #27272a !important;
}

.reader-more-dropdown-popper.is-day .el-dropdown-menu__item:hover,
.reader-more-dropdown-popper.is-day .el-dropdown-menu__item:focus {
  background-color: rgba(0, 0, 0, 0.05) !important;
  color: #09090b !important;
}

.reader-more-dropdown-popper.is-day .el-dropdown-menu__item--divided {
  border-top-color: rgba(0, 0, 0, 0.06) !important;
}

.reader-more-dropdown-popper.is-day .el-popper__arrow::before {
  background-color: #ffffff !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
}

/* 夜间深色模式下拉菜单（与阅读页主题完全同步） */
.reader-more-dropdown-popper.is-night .el-dropdown-menu {
  background-color: #222226 !important;
  border: 1px solid rgba(255, 255, 255, 0.14) !important;
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.6) !important;
}

.reader-more-dropdown-popper.is-night .el-dropdown-menu__item {
  color: #d4d4d8 !important;
}

.reader-more-dropdown-popper.is-night .el-dropdown-menu__item:hover,
.reader-more-dropdown-popper.is-night .el-dropdown-menu__item:focus {
  background-color: rgba(255, 255, 255, 0.1) !important;
  color: #ffffff !important;
}

.reader-more-dropdown-popper.is-night .el-dropdown-menu__item--divided {
  border-top-color: rgba(255, 255, 255, 0.1) !important;
}

.reader-more-dropdown-popper.is-night .el-dropdown-menu__item.is-disabled {
  color: #52525b !important;
}

.reader-more-dropdown-popper.is-night .el-popper__arrow::before {
  background-color: #222226 !important;
  border-color: rgba(255, 255, 255, 0.14) !important;
}
</style>
