<template>
  <div class="wrapper">
    <div
      v-for="cata in catas"
      class="cata-text"
      :key="cata.index"
      :class="{ selected: isSelected(cata.index) }"
      @click="gotoChapter(cata)"
    >
      {{ cata.title }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BookChapter } from '@/parsers/types'

const props = defineProps<{
  index: number
  source: BookChapter | { index: number; catas: BookChapter[] }
  gotoChapter: (chapter: BookChapter) => void
  currentChapterIndex: number
}>()

const isSelected = (idx: number) => {
  return idx === props.currentChapterIndex
}

// PC端 一个列表项中展示两个章节
const catas = computed(() => {
  const source = props.source
  if ('catas' in source) return source.catas
  return [props.source as BookChapter]
})
</script>

<style lang="scss" scoped>
.selected {
  color: #ed4259 !important;
  font-weight: bold;
}

.wrapper {
  display: flex;

  .cata-text {
    width: 100%;
    margin-right: 20px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: inherit;
    transition: color 0.2s ease;

    &:hover {
      color: #ed4259;
    }
  }
}
</style>
