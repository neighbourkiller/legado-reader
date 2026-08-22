<template>
  <div class="chapter-content-container">
    <div class="title" data-chapterpos="0">
      <span class="title-text">{{ title }}</span>
    </div>

    <!-- TXT 格式分段渲染 -->
    <template v-if="format === 'txt' && Array.isArray(contents)">
      <div
        v-for="(para, index) in contents"
        :key="index"
        class="paragraph"
        ref="paragraphRef"
        :data-chapterpos="index"
      >
        <p :style="{ fontFamily, fontSize }">{{ para }}</p>
      </div>
    </template>

    <!-- EPUB 富文本 HTML 渲染 -->
    <template v-else>
      <div
        class="epub-html-content"
        :style="{ fontFamily, fontSize }"
        v-html="epubHtml"
      ></div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import type { SpacingConfig } from '@/parsers/types'
import jump from '@/plugins/jump'

const props = defineProps<{
  contents: string[] | string
  title: string
  format: 'txt' | 'epub'
  spacing: SpacingConfig
  fontFamily: string
  fontSize: string
  chapterIndex: number
}>()

const epubHtml = computed(() => {
  return typeof props.contents === 'string' ? props.contents : props.contents.join('')
})

const paragraphRef = ref<HTMLElement[]>()

const scrollToParagraph = (index: number) => {
  if (!paragraphRef.value || !paragraphRef.value[index]) return
  nextTick(() => {
    jump(paragraphRef.value![index], {
      duration: 0,
    })
  })
}

defineExpose({
  scrollToParagraph,
})
</script>

<style lang="scss" scoped>
.chapter-content-container {
  width: 100%;
}

.title {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 57px;
  color: inherit;
  font:
    24px / 32px PingFangSC-Regular,
    HelveticaNeue-Light,
    'Helvetica Neue Light',
    'Microsoft YaHei',
    sans-serif;

  .title-text {
    flex: 1 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
  }
}

.paragraph {
  position: relative;
}

p {
  display: block;
  text-indent: 2em;
  text-align: justify;
  word-wrap: break-word;
  overflow-wrap: break-word;
  color: inherit;
  letter-spacing: calc(v-bind('props.spacing.letter') * 1em);
  line-height: calc(1 + v-bind('props.spacing.line'));
  margin: calc(v-bind('props.spacing.paragraph') * 1em) 0;

  :deep(img) {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 10px auto;
  }
}

.epub-html-content {
  color: inherit;
  letter-spacing: calc(v-bind('props.spacing.letter') * 1em);
  line-height: calc(1 + v-bind('props.spacing.line'));

  :deep(p) {
    text-indent: 2em;
    text-align: justify;
    word-wrap: break-word;
    color: inherit;
    margin: calc(v-bind('props.spacing.paragraph') * 1em) 0;
  }

  :deep(img) {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 12px auto;
    border-radius: 4px;
  }

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4) {
    margin: 24px 0 16px 0;
    color: inherit;
    font-weight: bold;
    line-height: 1.4;
  }
}
</style>
