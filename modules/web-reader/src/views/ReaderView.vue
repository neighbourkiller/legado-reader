<template>
  <div
    class="chapter-wrapper"
    :style="bodyTheme"
    :class="{ night: isNight, day: !isNight }"
    @click="handleWrapperClick"
  >
    <!-- 左侧经典浮动工具栏 -->
    <div class="tool-bar" :style="leftBarTheme" @click.stop>
      <div class="tools">
        <!-- 目录 -->
        <el-popover
          placement="right"
          :width="popupWidth"
          trigger="click"
          :show-arrow="false"
          v-model:visible="popCataVisible"
          popper-class="pop-cata"
        >
          <PopCatalog @getContent="getContent" class="popup" />
          <template #reference>
            <div class="tool-icon">
              <div class="iconfont">&#58905;</div>
              <div class="icon-text">目录</div>
            </div>
          </template>
        </el-popover>

        <!-- 设置 -->
        <el-popover
          placement="right"
          :width="popupWidth"
          trigger="click"
          :show-arrow="false"
          v-model:visible="readSettingsVisible"
          popper-class="pop-setting"
        >
          <ReadSettings class="popup" />
          <template #reference>
            <div class="tool-icon">
              <div class="iconfont">&#58971;</div>
              <div class="icon-text">设置</div>
            </div>
          </template>
        </el-popover>

        <!-- 书架 -->
        <div class="tool-icon" @click="toShelf">
          <div class="iconfont">&#58892;</div>
          <div class="icon-text">书架</div>
        </div>

        <!-- 顶部 -->
        <div class="tool-icon" @click="toTop">
          <div class="iconfont">&#58914;</div>
          <div class="icon-text">顶部</div>
        </div>

        <!-- 底部 -->
        <div class="tool-icon" @click="toBottom">
          <div class="iconfont">&#58915;</div>
          <div class="icon-text">底部</div>
        </div>
      </div>
    </div>

    <!-- 右侧经典浮动工具栏 -->
    <div class="read-bar" :style="rightBarTheme" @click.stop>
      <div class="tools">
        <div
          class="tool-icon"
          :class="{ 'no-point': isFirstChapter }"
          @click="toPreChapter"
        >
          <div class="iconfont">&#58920;</div>
          <span v-if="miniInterface">上一章</span>
        </div>
        <div
          class="tool-icon"
          :class="{ 'no-point': isLastChapter }"
          @click="toNextChapter"
        >
          <span v-if="miniInterface">下一章</span>
          <div class="iconfont">&#58913;</div>
        </div>
      </div>
    </div>

    <!-- 正文阅读区域 -->
    <div class="chapter" ref="contentRef" :style="chapterTheme">
      <div class="content">
        <div class="top-bar" ref="topRef"></div>

        <div
          v-for="data in chapterData"
          :key="data.index"
          :data-chapter-index="data.index"
        >
          <ChapterContent
            :contents="data.content"
            :title="data.title"
            :format="data.format"
            :spacing="settings.spacing"
            :fontSize="fontSizeStr"
            :fontFamily="fontFamilyStr"
            :chapterIndex="data.index"
          />
        </div>

        <!-- 触底无限加载指示器 -->
        <div class="loading" ref="loadingRef" v-if="infiniteLoading"></div>
        <div class="bottom-bar" ref="bottomRef"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, watchEffect, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'
import { useReadingStore, type ChapterPayload } from '@/stores/reading'
import { useTheme } from '@/composables/useTheme'
import PopCatalog from '@/components/PopCatalog.vue'
import ReadSettings from '@/components/ReadSettings.vue'
import ChapterContent from '@/components/ChapterContent.vue'
import themeConfig from '@/config/themeConfig'
import jump from '@/plugins/jump'
import { trimChapterWindowBeforeAppend } from '@/utils/chapterWindow'
import '@/assets/fonts/iconfont.css'

const route = useRoute()
const router = useRouter()
const store = useReadingStore()
const { isDark } = useTheme()

const {
  currentBook,
  chapters,
  settings,
  miniInterface,
  popCataVisible,
  readSettingsVisible,
} = storeToRefs(store)

const chapterData = ref<ChapterPayload[]>([])
const chapterLoading = ref(false)
const showToolBar = ref(false)
let contentGeneration = 0
let scrollObserver: IntersectionObserver | null = null

const topRef = ref<HTMLElement>()
const bottomRef = ref<HTMLElement>()
const loadingRef = ref<HTMLElement>()
const contentRef = ref<HTMLElement>()

// 章节状态
const currentChapterIndex = computed(() => currentBook.value?.currentChapter ?? 0)
const isFirstChapter = computed(() => currentChapterIndex.value <= 0)
const isLastChapter = computed(
  () => currentChapterIndex.value >= (chapters.value.length || 1) - 1
)

// 主题与颜色计算 (theme === 6 为夜间模式)
const isNight = computed(() => settings.value.theme === 6)
const bodyColor = computed(
  () => themeConfig.themes[settings.value.theme]?.body || '#ede7da'
)
const chapterColor = computed(
  () => themeConfig.themes[settings.value.theme]?.content || '#ede7da'
)
const popupColor = computed(
  () => themeConfig.themes[settings.value.theme]?.popup || '#ede7da'
)

// 响应式宽度与样式
const readWidth = computed(() => {
  if (!miniInterface.value) {
    return (settings.value.readWidth || 800) + 'px'
  } else {
    return '100%'
  }
})

const popupWidth = computed(() => {
  if (!miniInterface.value) {
    return (settings.value.readWidth || 800) - 33
  } else {
    return window.innerWidth - 33
  }
})

const bodyTheme = computed(() => ({
  background: bodyColor.value,
}))

const chapterTheme = computed(() => ({
  background: chapterColor.value,
  width: readWidth.value,
}))

// 左侧工具栏贴紧正文左边缘
const leftBarTheme = computed(() => ({
  background: popupColor.value,
  marginLeft: miniInterface.value
    ? '0'
    : -((settings.value.readWidth || 800) / 2 + 60) + 'px',
  display: miniInterface.value && !showToolBar.value ? 'none' : 'block',
}))

// 右侧工具栏贴紧正文右边缘
const rightBarTheme = computed(() => ({
  background: popupColor.value,
  marginRight: miniInterface.value
    ? '0'
    : -((settings.value.readWidth || 800) / 2 + 44) + 'px',
  display: miniInterface.value && !showToolBar.value ? 'none' : 'block',
}))

// 字体与字号
const fontFamilyStr = computed(() => {
  if (settings.value.font >= 0) {
    return themeConfig.fonts[settings.value.font] || 'Microsoft YaHei, sans-serif'
  }
  const custom = settings.value.customFontName?.trim()
  return custom
    ? `"${custom}", PingFangSC-Regular, sans-serif`
    : 'Microsoft YaHei, sans-serif'
})

const fontSizeStr = computed(() => `${settings.value.fontSize || 18}px`)

const infiniteLoading = computed(() => settings.value.infiniteLoading)

// 点击屏幕切换移动端工具栏
const handleWrapperClick = () => {
  if (miniInterface.value) {
    showToolBar.value = !showToolBar.value
  }
}

// 获取章节内容
const getContent = async (index: number, reloadChapter = true) => {
  if (index < 0 || index >= chapters.value.length) return

  const generation = reloadChapter ? ++contentGeneration : contentGeneration
  chapterLoading.value = true

  if (reloadChapter) {
    window.scrollTo(0, 0)
    chapterData.value = []
    await store.saveProgress(index).catch(console.error)
  } else {
    chapterData.value = trimChapterWindowBeforeAppend(chapterData.value)
  }

  try {
    const payload = await store.fetchChapter(index)
    if (generation !== contentGeneration) return

    if (payload) {
      chapterData.value.push(payload)
      if (reloadChapter && store.currentBook) {
        store.currentBook.currentChapter = index
      }
    }
  } catch (err) {
    console.error('获取章节内容失败', err)
    ElMessage.error('获取章节内容失败')
  } finally {
    if (generation === contentGeneration) {
      chapterLoading.value = false
    }
  }
}

// 底部触底无限加载
const loadMore = () => {
  const lastChapter = chapterData.value[chapterData.value.length - 1]
  if (!lastChapter) return
  const nextIndex = lastChapter.index + 1
  if (nextIndex < chapters.value.length) {
    getContent(nextIndex, false)
  }
}

const onReachBottom = (entries: IntersectionObserverEntry[]) => {
  if (chapterLoading.value) return
  for (const entry of entries) {
    if (entry.isIntersecting) {
      loadMore()
      break
    }
  }
}

watchEffect(() => {
  if (!infiniteLoading.value) {
    scrollObserver?.disconnect()
  } else if (loadingRef.value && scrollObserver) {
    scrollObserver.observe(loadingRef.value)
  }
})

// 顶部 / 底部跳转
const toTop = () => {
  if (topRef.value) jump(topRef.value, { duration: settings.value.jumpDuration })
}

const toBottom = () => {
  if (bottomRef.value) jump(bottomRef.value, { duration: settings.value.jumpDuration })
}

const toShelf = () => {
  router.push('/bookshelf')
}

// 章节前后切换
const toPreChapter = async () => {
  if (isFirstChapter.value) {
    ElMessage.warning('已经是第一章')
    return
  }
  ElMessage.info('上一章')
  await getContent(currentChapterIndex.value - 1, true)
}

const toNextChapter = async () => {
  if (isLastChapter.value) {
    ElMessage.warning('已经是最后一章')
    return
  }
  ElMessage.info('下一章')
  await getContent(currentChapterIndex.value + 1, true)
}

// 键盘事件
let canJump = true
const handleKeyPress = (event: KeyboardEvent) => {
  if (!canJump) return
  switch (event.key) {
    case 'ArrowLeft':
      event.stopPropagation()
      event.preventDefault()
      toPreChapter()
      break
    case 'ArrowRight':
      event.stopPropagation()
      event.preventDefault()
      toNextChapter()
      break
    case 'ArrowUp':
      event.stopPropagation()
      event.preventDefault()
      if (document.documentElement.scrollTop === 0) {
        ElMessage.warning('已到达页面顶部')
      } else {
        canJump = false
        jump(0 - document.documentElement.clientHeight + 100, {
          duration: settings.value.jumpDuration,
          callback: () => (canJump = true),
        })
      }
      break
    case 'ArrowDown':
      event.stopPropagation()
      event.preventDefault()
      if (
        document.documentElement.clientHeight +
          document.documentElement.scrollTop >=
        document.documentElement.scrollHeight - 5
      ) {
        ElMessage.warning('已到达页面底部')
      } else {
        canJump = false
        jump(document.documentElement.clientHeight - 100, {
          duration: settings.value.jumpDuration,
          callback: () => (canJump = true),
        })
      }
      break
  }
}

const ignoreKeyPress = (event: KeyboardEvent) => {
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()
  }
}

// 滚动阅读进度更新
let progressFrame: number | null = null
const updateReadingProgress = () => {
  progressFrame = null
  let paragraph: HTMLElement | null = null
  for (const element of document.elementsFromPoint(
    window.innerWidth / 2,
    40
  )) {
    paragraph = element.closest<HTMLElement>('[data-chapterpos]')
    if (paragraph !== null) break
  }
  const chapterElem = paragraph?.closest<HTMLElement>('[data-chapter-index]')
  const index = Number(chapterElem?.dataset.chapterIndex)
  if (Number.isInteger(index) && index !== currentChapterIndex.value) {
    store.saveProgress(index).catch(console.error)
  }
}

const onScroll = () => {
  if (progressFrame === null) {
    progressFrame = window.requestAnimationFrame(updateReadingProgress)
  }
}

// 窗口尺寸变化
const onResize = () => {
  store.setMiniInterface(window.innerWidth < 776)
  if (!store.miniInterface) {
    if (settings.value.readWidth < 640) settings.value.readWidth = 640
    if (settings.value.readWidth + 2 * 68 > window.innerWidth) {
      settings.value.readWidth = Math.max(640, window.innerWidth - 160)
    }
  }
}

// 页面标题更新
watchEffect(() => {
  const title = chapters.value[currentChapterIndex.value]?.title
  if (currentBook.value && title) {
    document.title = `${currentBook.value.name} | ${title}`
  }
})

// 监听书架暗黑模式与阅读器主题同步
watch(
  () => isDark.value,
  dark => {
    if (dark && settings.value.theme !== 6) {
      settings.value.theme = 6
      store.updateSettings({ theme: 6 }).catch(console.error)
    } else if (!dark && settings.value.theme === 6) {
      settings.value.theme = 1
      store.updateSettings({ theme: 1 }).catch(console.error)
    }
  }
)

// 监听页面隐藏自动保存进度
const onVisibilityChange = () => {
  if (document.visibilityState === 'hidden' && currentBook.value) {
    store.saveProgress().catch(console.error)
  }
}

onMounted(async () => {
  const rawId = route.params.id
  const bookId = Array.isArray(rawId) ? rawId[0] : (rawId as string)
  if (!bookId) {
    router.push('/bookshelf')
    return
  }

  try {
    await store.loadBook(bookId)

    // 初始化时同步当前书架浅色/暗黑模式
    if (isDark.value && settings.value.theme !== 6) {
      settings.value.theme = 6
      await store.updateSettings({ theme: 6 }).catch(console.error)
    } else if (!isDark.value && settings.value.theme === 6) {
      settings.value.theme = 1
      await store.updateSettings({ theme: 1 }).catch(console.error)
    }

    onResize()
    window.addEventListener('resize', onResize)

    // 若保存了自定义网络字体，页面刷新时自动挂载
    if (
      settings.value.font === -1 &&
      settings.value.customFontName &&
      settings.value.customFontUrl &&
      typeof FontFace === 'function'
    ) {
      try {
        const fontface = new FontFace(
          settings.value.customFontName,
          `url("${settings.value.customFontUrl}")`
        )
        fontface
          .load()
          .then(loaded => {
            document.fonts.add(loaded)
          })
          .catch(err => {
            console.warn('自动重新挂载自定义网络字体失败:', err)
          })
      } catch (e) {
        console.warn('FontFace 初始化失败:', e)
      }
    }

    if (chapters.value.length === 0) {
      ElMessage.warning('该书籍未包含任何章节')
      return
    }

    const initialChapter = Math.max(
      0,
      Math.min(chapters.value.length - 1, currentBook.value?.currentChapter ?? 0)
    )
    await getContent(initialChapter, true)

    window.addEventListener('keyup', handleKeyPress)
    window.addEventListener('keydown', ignoreKeyPress)
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('visibilitychange', onVisibilityChange)

    scrollObserver = new IntersectionObserver(onReachBottom, {
      rootMargin: '-100% 0% 20% 0%',
    })
    if (infiniteLoading.value && loadingRef.value) {
      scrollObserver.observe(loadingRef.value)
    }
  } catch (err) {
    console.error('加载图书失败详情:', err)
    ElMessage.error(
      err instanceof Error ? `加载图书失败: ${err.message}` : '加载图书失败，正在返回书架...'
    )
    setTimeout(toShelf, 1500)
  }
})

onUnmounted(() => {
  window.removeEventListener('keyup', handleKeyPress)
  window.removeEventListener('keydown', ignoreKeyPress)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('scroll', onScroll)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  if (progressFrame !== null) window.cancelAnimationFrame(progressFrame)
  popCataVisible.value = false
  readSettingsVisible.value = false
  scrollObserver?.disconnect()
  scrollObserver = null
  store.cleanup()
})

onBeforeRouteLeave(() => {
  window.removeEventListener('keyup', handleKeyPress)
  if (currentBook.value) {
    store.saveProgress().catch(console.error)
  }
})
</script>

<style lang="scss" scoped>
:deep(.pop-setting) {
  margin-left: 68px;
  top: 0;
}

:deep(.pop-cata) {
  margin-left: 10px;
}

.chapter-wrapper {
  padding: 0;
  width: 100%;
  min-height: 100vh;
  position: relative;

  .tool-bar {
    position: fixed;
    top: 0;
    left: 50%;
    z-index: 100;

    .tools {
      display: flex;
      flex-direction: column;

      .tool-icon {
        box-sizing: content-box !important;
        font-size: 18px;
        width: 58px;
        height: 48px;
        text-align: center;
        padding-top: 12px;
        cursor: pointer;
        outline: none;

        .iconfont {
          font-family: iconfont !important;
          width: 16px;
          height: 16px;
          font-size: 16px;
          margin: 0 auto 6px;
        }

        .icon-text {
          font-size: 12px;
          line-height: 1;
        }
      }
    }
  }

  .read-bar {
    position: fixed;
    bottom: 0;
    right: 50%;
    z-index: 100;

    .tools {
      display: flex;
      flex-direction: column;

      .tool-icon {
        box-sizing: content-box !important;
        font-size: 18px;
        width: 42px;
        height: 31px;
        padding-top: 12px;
        text-align: center;
        align-items: center;
        cursor: pointer;
        outline: none;
        margin-top: -1px;

        .iconfont {
          font-family: iconfont !important;
          width: 16px;
          height: 16px;
          font-size: 16px;
          margin: 0 auto 6px;
        }

        &.no-point {
          opacity: 0.35;
          pointer-events: none;
        }
      }
    }
  }

  .chapter {
    font-family: 'Microsoft YaHei', PingFangSC-Regular, HelveticaNeue-Light,
      'Helvetica Neue Light', sans-serif;
    text-align: left;
    padding: 0 65px;
    min-height: 100vh;
    margin: 0 auto;
    box-sizing: border-box;

    .content {
      font-size: 18px;
      line-height: 1.8;

      .top-bar,
      .bottom-bar {
        height: 64px;
      }

      .loading {
        height: 40px;
      }
    }
  }
}

.day {
  :deep(.popup) {
    box-shadow:
      0 2px 4px rgba(0, 0, 0, 0.12),
      0 0 6px rgba(0, 0, 0, 0.04);
  }

  .tool-icon {
    border: 1px solid rgba(0, 0, 0, 0.1);
    margin-top: -1px;
    color: #000;

    .icon-text {
      color: rgba(0, 0, 0, 0.4);
    }
  }

  .chapter {
    border: 1px solid #d8d8d8;
    color: #262626;
  }
}

.night {
  :deep(.popup) {
    box-shadow:
      0 2px 4px rgba(0, 0, 0, 0.48),
      0 0 6px rgba(0, 0, 0, 0.16);
  }

  .tool-icon {
    border: 1px solid #444;
    margin-top: -1px;
    color: #666;

    .icon-text {
      color: #666;
    }
  }

  .chapter {
    border: 1px solid #444;
    color: #666;
  }

  :deep(.popper__arrow) {
    background: #666;
  }
}

@media screen and (max-width: 776px) {
  .chapter-wrapper {
    padding: 0;

    .tool-bar {
      left: 0;
      top: auto;
      bottom: 0;
      width: 100vw;
      margin-left: 0 !important;

      .tools {
        flex-direction: row;
        justify-content: space-around;

        .tool-icon {
          border: none;
          height: 48px;
          padding-top: 6px;
        }
      }
    }

    .read-bar {
      right: 0;
      top: 0;
      bottom: auto;
      width: 100vw;
      margin-right: 0 !important;

      .tools {
        flex-direction: row;
        justify-content: space-between;
        padding: 0 15px;

        .tool-icon {
          border: none;
          width: auto;
          height: 40px;
          padding-top: 6px;
          display: flex;
          align-items: center;
          gap: 6px;

          .iconfont {
            display: inline-block;
            margin: 0;
          }
        }
      }
    }

    .chapter {
      width: 100vw !important;
      padding: 0 20px;
      box-sizing: border-box;
      border: none !important;
    }
  }
}
</style>
