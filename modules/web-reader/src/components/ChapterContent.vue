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
          <div v-if="isImageParagraph(para)" class="embedded-source-image-wrap">
            <img
              class="embedded-source-image"
              :src="getImageParagraphUrl(para)"
              :alt="`插图 ${index + 1}`"
              loading="lazy"
            />
          </div>
          <p v-else :style="{ fontFamily, fontSize }">{{ para }}</p>
        </div>
        <img
          v-for="image in orphanEmbeddedImages"
          :key="`embedded:${image.index}:${image.url}`"
          class="embedded-source-image"
          :src="image.url"
          :alt="image.alt || ''"
          loading="lazy"
        />
      </template>

      <div v-else-if="format === 'images'" class="image-chapter" data-reader-image-chapter>
        <figure v-for="image in imageContents" :key="`${image.index}:${image.url}`" class="chapter-image-wrap">
          <img
            :src="image.url"
            :alt="image.alt || `第 ${image.index + 1} 张图片`"
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade"
            @error="onImageError(image.index)"
            @load="failedImages.delete(image.index)"
          />
          <button v-if="failedImages.has(image.index)" type="button" class="image-retry" @click.stop="retryImage($event)">
            第 {{ image.index + 1 }} 张图片加载失败，点击重试
          </button>
        </figure>
      </div>

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
import type { ImageReference } from '@/source/types/BookSource'
import { resolveTextAnchor } from '@/utils/textSelection'
import jump from '@/plugins/jump'

const props = defineProps<{
  contents: string[] | string | ImageReference[]
  title: string
  format: 'txt' | 'epub' | 'images'
  spacing: SpacingConfig
  fontFamily: string
  fontSize: string
  chapterIndex: number
  highlights?: HighlightRecord[]
  embeddedImages?: ImageReference[]
}>()

const emit = defineEmits<{
  highlightClick: [highlight: HighlightRecord]
}>()

const epubHtml = computed(() => {
  return typeof props.contents === 'string' ? props.contents
    : props.format === 'epub' ? (props.contents as string[]).join('') : ''
})
const imageContents = computed(() => props.format === 'images' ? props.contents as ImageReference[] : [])

const isImageParagraph = (para: unknown): boolean => {
  return typeof para === 'string' && /^<img\s+[^>]*src=["']([^"']+)["'][^>]*>$/i.test(para.trim())
}

const getImageParagraphUrl = (para: unknown): string => {
  if (typeof para !== 'string') return ''
  const match = para.trim().match(/<img\s+[^>]*src=["']([^"']+)["'][^>]*>/i)
  return match ? match[1] : ''
}

const orphanEmbeddedImages = computed(() => {
  if (!props.embeddedImages || props.embeddedImages.length === 0) return []
  if (!Array.isArray(props.contents)) return props.embeddedImages
  const contentsArray = props.contents as unknown[]
  return props.embeddedImages.filter(img =>
    !contentsArray.some(p => typeof p === 'string' && p.includes(img.url))
  )
})
const failedImages = ref(new Set<number>())
const onImageError = (index: number) => failedImages.value = new Set(failedImages.value).add(index)
const retryImage = (event: MouseEvent) => {
  const image = (event.currentTarget as HTMLElement).previousElementSibling as HTMLImageElement | null
  if (!image) return
  const url = new URL(image.src)
  url.searchParams.set('_legado_retry', String(Date.now()))
  image.src = url.href
}

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
  if (!root || props.format === 'images') return
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
  letter-spacing: var(--reader-letter-spacing, calc(v-bind('props.spacing.letter') * 1em));
  line-height: var(--reader-line-height, calc(1 + v-bind('props.spacing.line')));
  margin: var(--reader-paragraph-margin, calc(v-bind('props.spacing.paragraph') * 1em) 0);

  :deep(img) {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 10px auto;
  }
}

.epub-html-content {
  color: inherit;
  letter-spacing: var(--reader-letter-spacing, calc(v-bind('props.spacing.letter') * 1em));
  line-height: var(--reader-line-height, calc(1 + v-bind('props.spacing.line')));

  :deep(p) {
    text-indent: 2em;
    text-align: justify;
    word-wrap: break-word;
    color: inherit;
    margin: var(--reader-paragraph-margin, calc(v-bind('props.spacing.paragraph') * 1em) 0);
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

.image-chapter {
  user-select: none;
}

.embedded-source-image-wrap {
  display: flex;
  justify-content: center;
  margin: 16px 0;
}

.embedded-source-image {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 12px auto;
  border-radius: 4px;
}

.chapter-image-wrap {
  margin: 0 0 16px;
  text-align: center;

  img {
    display: block;
    width: auto;
    max-width: 100%;
    height: auto;
    margin: 0 auto;
  }
}

.image-retry {
  width: 100%;
  min-height: 88px;
  border: 1px dashed currentColor;
  color: inherit;
  background: transparent;
  cursor: pointer;
}
</style>
