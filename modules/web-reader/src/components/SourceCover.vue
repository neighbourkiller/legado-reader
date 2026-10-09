<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import defaultCover from '@/assets/imgs/default_novel_cover.png'
import { platform } from '@/platform/capabilities'
import { CoverLoadError, loadSourceCover, openCoverVerification } from '@/platform/sourceCovers'

const props = defineProps<{ src?: string; sourceUrl?: string; referer?: string; alt?: string }>()
const image = ref(defaultCover)
const status = ref<'loading' | 'ready' | 'fallback'>('loading')
const verification = ref(false)
const opened = ref(false)
const opening = ref(false)
const notice = ref('')
let generation = 0
let objectUrl: string | undefined
let directAttempts = 0
let retryTimer: ReturnType<typeof setTimeout> | undefined
let loadTimer: ReturnType<typeof setTimeout> | undefined
const container = ref<HTMLElement | null>(null)
const visible = ref(typeof IntersectionObserver === 'undefined')
let observer: IntersectionObserver | undefined
const native = computed(() => platform.isDesktop && Boolean(props.sourceUrl) && /^https?:\/\//i.test(props.src || ''))
const hint = computed(() => notice.value || (verification.value ? '封面需要网页验证，暂用默认封面' : '封面加载失败，暂用默认封面'))

function release() {
  clearTimeout(retryTimer)
  clearTimeout(loadTimer)
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = undefined
}
async function load(refresh = false) {
  const current = ++generation
  release()
  image.value = defaultCover
  verification.value = false
  notice.value = ''
  directAttempts = 0
  if (!props.src) { status.value = 'fallback'; return }
  status.value = 'loading'
  if (!visible.value) return
  if (!native.value) { showDirect(); return }
  try {
    const blob = await loadSourceCover({ url: props.src, sourceUrl: props.sourceUrl, referer: props.referer }, refresh)
    if (current !== generation) return
    objectUrl = URL.createObjectURL(blob)
    image.value = objectUrl
    status.value = 'ready'
  } catch (error) {
    if (current !== generation) return
    verification.value = error instanceof CoverLoadError && error.needsVerification
    status.value = 'fallback'
  }
}
function showDirect() {
  image.value = props.src!
  loadTimer = setTimeout(() => failed(), 10000)
}
function loaded(event: Event) {
  if ((event.target as HTMLImageElement).getAttribute('src') !== image.value || image.value === defaultCover) return
  clearTimeout(loadTimer)
  status.value = 'ready'
}
function failed(event?: Event) {
  if (event && (event.target as HTMLImageElement).getAttribute('src') !== image.value) return
  clearTimeout(loadTimer)
  if (image.value === defaultCover) return // 本地兜底失败也不能形成重试循环。
  if (!native.value && /^https?:\/\//i.test(props.src || '') && directAttempts++ === 0) {
    const current = generation
    image.value = defaultCover
    retryTimer = setTimeout(() => { if (current === generation) showDirect() }, 400)
    return
  }
  release()
  image.value = defaultCover
  status.value = 'fallback'
}
async function verify() {
  if (!props.sourceUrl || opening.value) return
  const current = generation
  opening.value = true
  try {
    await openCoverVerification(props.sourceUrl, props.referer)
    if (current === generation) opened.value = true
  } catch {
    if (current === generation) notice.value = '无法打开验证窗口，请前往书源管理验证后重试'
  } finally { if (current === generation) opening.value = false }
}
watch(() => [props.src, props.sourceUrl, props.referer, visible.value], () => {
  opened.value = opening.value = false
  void load()
}, { immediate: true })
onMounted(() => {
  if (!visible.value && container.value) {
    observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { visible.value = true; observer?.disconnect() }
    }, { rootMargin: '200px' })
    observer.observe(container.value)
  }
})
onBeforeUnmount(() => { generation++; observer?.disconnect(); release() })
</script>

<template>
  <div ref="container" class="source-cover" :aria-busy="status === 'loading'">
    <img :src="image" :alt="alt || '书籍封面'" @error="failed" @load="loaded" />
    <div v-if="status === 'fallback' && src" class="cover-actions" :title="hint" @click.stop>
      <span class="cover-status" role="status">{{ verification ? '需要网页验证' : '暂用默认封面' }}</span>
      <button v-if="native && verification && !opened" type="button" :disabled="opening" @click.stop="verify">网页验证</button>
      <button type="button" @click.stop="load(true)">{{ opened ? '验证完成，重试' : '重试' }}</button>
    </div>
  </div>
</template>

<style scoped>
.source-cover { position: relative; display: block; width: 100%; height: 100%; overflow: hidden; }
.source-cover > img { display: block; width: 100%; height: 100%; object-fit: cover; }
.cover-actions { position: absolute; inset: auto 0 0; padding: 3px; background: rgb(0 0 0 / 72%); color: white; text-align: center; font-size: 10px; }
.cover-status { display: block; }
.cover-actions button { color: white; background: transparent; border: 1px solid #aaa; border-radius: 3px; padding: 2px 4px; cursor: pointer; font-size: 10px; }
</style>
