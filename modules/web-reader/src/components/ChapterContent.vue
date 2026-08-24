<template>
  <div class="chapter-content-container">
    <div class="title" data-chapterpos="0">
      <span class="title-text">{{ title }}</span>
    </div>

    <div ref="bodyRef" data-reader-body @click="handleBodyClick">
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
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, onMounted, watch } from 'vue'
import type { SpacingConfig } from '@/parsers/types'
import type { HighlightRecord } from '@/storage/db'
import { resolveTextAnchor } from '@/utils/textSelection'
import jump from '@/plugins/jump'

const props = defineProps<{
  contents: string[] | string
  title: string
  format: 'txt' | 'epub'
  spacing: SpacingConfig
  fontFamily: string
  fontSize: string
  chapterIndex: number
  highlights?: HighlightRecord[]
}>()

const emit = defineEmits<{
  highlightClick: [highlight: HighlightRecord]
}>()

const epubHtml = computed(() => {
  return typeof props.contents === 'string' ? props.contents : props.contents.join('')
})

const paragraphRef = ref<HTMLElement[]>()
const bodyRef = ref<HTMLElement>()

const clearHighlightMarks = () => {
  if (!bodyRef.value) return
  bodyRef.value.querySelectorAll<HTMLElement>('mark[data-reader-highlight]').forEach(mark => {
    mark.replaceWith(document.createTextNode(mark.textContent || ''))
  })
  bodyRef.value.normalize()
}

const annotateEpubParagraphs = () => {
  if (!bodyRef.value || props.format !== 'epub') return
  const blocks = bodyRef.value.querySelectorAll<HTMLElement>(
    '.epub-html-content p, .epub-html-content li, .epub-html-content blockquote, .epub-html-content h1, .epub-html-content h2, .epub-html-content h3, .epub-html-content h4, .epub-html-content h5, .epub-html-content h6',
  )
  blocks.forEach((block, index) => { block.dataset.chapterpos = String(index) })
}

const applyHighlights = () => {
  const root = bodyRef.value
  if (!root) return
  clearHighlightMarks()
  annotateEpubParagraphs()
  const fullText = root.textContent || ''
  const highlights = (props.highlights || []).flatMap(item => {
    const resolved = resolveTextAnchor(fullText, item.text, item.startOffset)
    return resolved ? [{ ...item, ...resolved }] : []
  }).filter(item => item.endOffset > item.startOffset)
  if (highlights.length === 0) return

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Array<{ node: Text; start: number; end: number }> = []
  let offset = 0
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const start = offset
    offset += node.data.length
    nodes.push({ node, start, end: offset })
  }

  for (const { node, start, end } of nodes) {
    const boundaries = new Set<number>([0, node.data.length])
    const overlapping = highlights.filter(item => item.startOffset < end && item.endOffset > start)
    if (overlapping.length === 0) continue
    for (const item of overlapping) {
      boundaries.add(Math.max(0, item.startOffset - start))
      boundaries.add(Math.min(node.data.length, item.endOffset - start))
    }
    const sorted = [...boundaries].sort((a, b) => a - b)
    const fragment = document.createDocumentFragment()
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const localStart = sorted[index]!
      const localEnd = sorted[index + 1]!
      const text = node.data.slice(localStart, localEnd)
      const absoluteMiddle = start + localStart + (localEnd - localStart) / 2
      const highlight = [...overlapping]
        .reverse()
        .find(item => absoluteMiddle >= item.startOffset && absoluteMiddle < item.endOffset)
      if (!highlight) {
        fragment.append(text)
        continue
      }
      const mark = document.createElement('mark')
      mark.dataset.readerHighlight = highlight.id
      mark.className = `reader-highlight reader-highlight--${highlight.style.kind}`
      if (highlight.style.kind === 'background') {
        mark.style.backgroundColor = highlight.style.color
      } else {
        mark.style.textDecoration = `underline ${highlight.style.lineStyle || 'solid'} ${highlight.style.color} 2px`
      }
      mark.textContent = text
      fragment.append(mark)
    }
    node.replaceWith(fragment)
  }
}

const handleBodyClick = (event: MouseEvent) => {
  const mark = (event.target as Element | null)?.closest<HTMLElement>('mark[data-reader-highlight]')
  const highlight = props.highlights?.find(item => item.id === mark?.dataset.readerHighlight)
  if (highlight) {
    event.preventDefault()
    event.stopPropagation()
    emit('highlightClick', highlight)
  }
}

onMounted(() => nextTick(applyHighlights))
watch(
  () => [props.contents, props.highlights],
  () => nextTick(applyHighlights),
  { deep: true },
)

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

:deep(mark.reader-highlight) {
  padding: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
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
