<template>
  <div
    :class="{ 'cata-wrapper': true, visible: popCataVisible }"
    :style="popupTheme"
  >
    <div class="title">目录 (共 {{ chapters.length }} 章)</div>
    <div
      class="catalog-scroll-container"
      :class="{ night: isNight, day: !isNight }"
      ref="scrollContainerRef"
    >
      <div
        v-for="(item, idx) in listData"
        :key="idx"
        class="cata"
      >
        <CatalogItem
          :index="idx"
          :source="item"
          :gotoChapter="gotoChapter"
          :currentChapterIndex="currentChapterIndex"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import settings from '@/config/themeConfig'
import '@/assets/fonts/popfont.css'
import CatalogItem from './CatalogItem.vue'
import { useReadingStore } from '@/stores/reading'
import type { BookChapter } from '@/parsers/types'

const store = useReadingStore()
const { chapters, popCataVisible, miniInterface, settings: readSettings, currentBook } = storeToRefs(store)

const emit = defineEmits<{
  getContent: [index: number]
}>()

const isNight = computed(() => readSettings.value.theme === 6)
const popupTheme = computed(() => {
  const themeIdx = readSettings.value.theme ?? 1
  return {
    background: settings.themes[themeIdx]?.popup || '#ede7da',
  }
})

// 数据源：PC端双列，移动端单列
const listData = computed(() => {
  const list = chapters.value
  if (miniInterface.value) return list

  const length = Math.ceil(list.length / 2)
  const result = new Array<{ index: number; catas: BookChapter[] }>(length)
  for (let i = 0; i < length; i++) {
    result[i] = {
      index: i,
      catas: list.slice(2 * i, 2 * i + 2),
    }
  }
  return result
})

const currentChapterIndex = computed(() => currentBook.value?.currentChapter ?? 0)
const scrollContainerRef = ref<HTMLElement>()

// 打开目录时自动滚动到当前章节位置
watch(
  () => popCataVisible.value,
  visible => {
    if (visible) {
      nextTick(() => {
        if (!scrollContainerRef.value) return
        const activeElem = scrollContainerRef.value.querySelector('.selected')
        if (activeElem) {
          activeElem.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      })
    }
  }
)

const gotoChapter = (chapter: BookChapter) => {
  store.popCataVisible = false
  emit('getContent', chapter.index)
}
</script>

<style lang="scss" scoped>
.cata-wrapper {
  margin: -16px;
  padding: 18px 16px 24px 24px;
  box-sizing: border-box;

  .title {
    font-size: 18px;
    font-weight: 400;
    font-family: FZZCYSK, sans-serif;
    margin: 0 0 16px 0;
    color: #ed4259;
    width: fit-content;
    border-bottom: 2px solid #ed4259;
    padding-bottom: 4px;
  }

  .catalog-scroll-container {
    height: 380px;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 8px;

    &::-webkit-scrollbar {
      width: 6px;
    }
    &::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.15);
      border-radius: 3px;
    }

    .cata {
      height: 38px;
      cursor: pointer;
      font: 15px / 38px PingFangSC-Regular,
        HelveticaNeue-Light,
        'Helvetica Neue Light',
        'Microsoft YaHei',
        sans-serif;
    }

    &.night {
      .cata {
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      &::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
      }
    }

    &.day {
      .cata {
        border-bottom: 1px solid rgba(0, 0, 0, 0.05);
      }
    }
  }
}
</style>
