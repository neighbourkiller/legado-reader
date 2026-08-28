<template>
  <div class="source-debug-panel" v-if="source">
    <!-- 调试控制工具栏 -->
    <div class="debug-toolbar">
      <div class="toolbar-left">
        <el-input
          v-model="debugKeyword"
          placeholder="输入调试关键词..."
          clearable
          class="debug-keyword-input sharp-input"
          @keyup.enter="!isDebugging && startDebug()"
        />
        <el-button type="warning" plain @click="showAuthDialog = true" class="sharp-btn">
          <el-icon><Key /></el-icon>
          <span>网页验证 (CF盾)</span>
        </el-button>
        <el-button
          :type="isDebugging ? 'danger' : 'primary'"
          @click="toggleDebug"
          class="sharp-btn"
        >
          <el-icon>
            <VideoPause v-if="isDebugging" />
            <VideoPlay v-else />
          </el-icon>
          <span>{{ isDebugging ? '停止调试' : '开始调试' }}</span>
        </el-button>
      </div>
      <div class="toolbar-right">
        <el-tag size="small" effect="plain" class="sharp-tag">
          {{ source.webReaderCompatibilityMode || 'legado' }} 模式
        </el-tag>
      </div>
    </div>

    <!-- 调试主体内容滚动区 -->
    <div class="debug-content-body">
      <!-- 分步状态展示 -->
      <div class="debug-steps">
        <!-- 步骤 1: 搜索书籍 -->
        <div class="step-card sharp-card" :class="getStepClass('search')">
          <div class="step-header">
            <div class="step-title">
              <span class="step-num sharp-num">1</span>
              <span>搜索书籍 (Search)</span>
            </div>
            <span class="step-status">{{ getStepStatusText('search') }}</span>
          </div>
          <div class="step-detail" v-if="stepResults.search">
            <div class="detail-row">
              <span class="label">解析数量:</span>
              <span class="val font-bold">{{ stepResults.search.count }} 本</span>
              <span class="time-cost" v-if="stepResults.search.time">({{ stepResults.search.time }}ms)</span>
            </div>
            <div class="search-preview-list" v-if="stepResults.search.books?.length">
              <div
                v-for="(bk, idx) in stepResults.search.books.slice(0, 3)"
                :key="idx"
                class="search-preview-item sharp-card"
              >
                <div class="bk-title">{{ bk.name }} <span class="bk-author">{{ bk.author }}</span></div>
                <div class="bk-url" :title="bk.bookUrl">{{ bk.bookUrl }}</div>
                <div class="bk-last" v-if="bk.lastChapter">最新: {{ bk.lastChapter }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 步骤 2: 书籍详情 -->
        <div class="step-card sharp-card" :class="getStepClass('bookInfo')">
          <div class="step-header">
            <div class="step-title">
              <span class="step-num sharp-num">2</span>
              <span>书籍详情 (BookInfo)</span>
            </div>
            <span class="step-status">{{ getStepStatusText('bookInfo') }}</span>
          </div>
          <div class="step-detail" v-if="stepResults.bookInfo">
            <div class="detail-row">
              <span class="label">书名/作者:</span>
              <span class="val">{{ stepResults.bookInfo.name }} / {{ stepResults.bookInfo.author || '无' }}</span>
              <span class="time-cost" v-if="stepResults.bookInfo.time">({{ stepResults.bookInfo.time }}ms)</span>
            </div>
            <div class="detail-row" v-if="stepResults.bookInfo.tocUrl">
              <span class="label">目录链接:</span>
              <span class="val url-text" :title="stepResults.bookInfo.tocUrl">{{ stepResults.bookInfo.tocUrl }}</span>
            </div>
            <div class="detail-row" v-if="stepResults.bookInfo.intro">
              <span class="label">简介:</span>
              <span class="val intro-text">{{ stepResults.bookInfo.intro }}</span>
            </div>
          </div>
        </div>

        <!-- 步骤 3: 目录列表 -->
        <div class="step-card sharp-card" :class="getStepClass('toc')">
          <div class="step-header">
            <div class="step-title">
              <span class="step-num sharp-num">3</span>
              <span>目录列表 (TOC)</span>
            </div>
            <span class="step-status">{{ getStepStatusText('toc') }}</span>
          </div>
          <div class="step-detail" v-if="stepResults.toc">
            <div class="detail-row">
              <span class="label">章节总数:</span>
              <span class="val font-bold">{{ stepResults.toc.totalChapters }} 章</span>
              <span class="time-cost" v-if="stepResults.toc.time">({{ stepResults.toc.time }}ms)</span>
            </div>
            <div class="detail-row" v-if="stepResults.toc.firstChapter">
              <span class="label">首章:</span>
              <span class="val">{{ stepResults.toc.firstChapter.name }}</span>
            </div>
            <div class="detail-row" v-if="stepResults.toc.lastChapter">
              <span class="label">末章:</span>
              <span class="val">{{ stepResults.toc.lastChapter.name }}</span>
            </div>
          </div>
        </div>

        <!-- 步骤 4: 正文内容 -->
        <div class="step-card sharp-card" :class="getStepClass('content')">
          <div class="step-header">
            <div class="step-title">
              <span class="step-num sharp-num">4</span>
              <span>正文内容 (Content)</span>
            </div>
            <span class="step-status">{{ getStepStatusText('content') }}</span>
          </div>
          <div class="step-detail" v-if="stepResults.content">
            <div class="detail-row">
              <span class="label">首章字数:</span>
              <span class="val font-bold">{{ stepResults.content.charCount }} 字</span>
              <span class="time-cost" v-if="stepResults.content.time">({{ stepResults.content.time }}ms)</span>
            </div>
            <div class="content-preview" v-if="stepResults.content.preview">
              {{ stepResults.content.preview }}
            </div>
          </div>
        </div>
      </div>

      <!-- 控制台实时诊断日志 -->
      <div class="debug-console-section">
        <div class="console-header">
          <span class="console-title">调试运行日志与诊断</span>
          <div class="console-actions">
            <el-button text size="small" @click="copyLogs" class="sharp-btn">复制日志</el-button>
            <el-button text size="small" @click="logs = []" class="sharp-btn">清空日志</el-button>
          </div>
        </div>
        <div class="console-box sharp-card" ref="consoleBoxRef">
          <div v-if="logs.length === 0" class="console-empty">
            点击上方“开始调试”按钮查看实时请求与解析诊断日志...
          </div>
          <div
            v-for="(log, index) in logs"
            :key="index"
            class="log-line"
            :class="'log-' + log.type"
          >
            <span class="log-time">[{{ log.time }}]</span>
            <span class="log-tag">{{ log.tag }}</span>
            <span class="log-msg">{{ log.message }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 网页验证与 Cookie 注入 Dialog -->
    <SourceAuthDialog
      v-model="showAuthDialog"
      :source="source"
      @saved="handleAuthSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { VideoPlay, VideoPause, Key } from '@element-plus/icons-vue'
import type { BookSource, SearchResult } from '@/source/types/BookSource'
import type { TocItem } from '@/source/engine/TocParser'
import { SourceEngine, parseSearchUrl, CloudflareChallengeError } from '@/source/engine/SourceEngine'
import SourceAuthDialog from './SourceAuthDialog.vue'
import { inspectSourceCompatibility } from '@/source/engine/Compatibility'
import { RuleExecutionError } from '@/source/engine/RuleTypes'
import { copyTextToClipboard } from '@/platform/clipboard'

const props = defineProps<{
  source: BookSource | null
}>()

const showAuthDialog = ref(false)

function handleAuthSaved() {
  appendLog('AUTH', '已成功保存并注入 Cookie 与 User-Agent，可重新点击“开始调试”测试！', 'success')
}

const debugKeyword = ref('系统')
const isDebugging = ref(false)
const consoleBoxRef = ref<HTMLElement | null>(null)

interface LogItem {
  time: string
  tag: string
  type: 'info' | 'success' | 'warn' | 'error'
  message: string
}

const logs = ref<LogItem[]>([])

interface DebugCacheItem {
  keyword: string
  stepStatus: {
    search: 'idle' | 'running' | 'success' | 'failed'
    bookInfo: 'idle' | 'running' | 'success' | 'failed'
    toc: 'idle' | 'running' | 'success' | 'failed'
    content: 'idle' | 'running' | 'success' | 'failed'
  }
  stepResults: {
    search?: { count: number; time: number; books: SearchResult[] }
    bookInfo?: { name: string; author: string; intro: string; tocUrl: string; time: number }
    toc?: { totalChapters: number; firstChapter: TocItem | null; lastChapter: TocItem | null; time: number }
    content?: { charCount: number; preview: string; time: number }
  }
  logs: LogItem[]
}

// 缓存各书源最近一次的调试结果
const debugResultCache = new Map<string, DebugCacheItem>()

function saveToCache(targetUrl?: string) {
  const url = targetUrl || props.source?.bookSourceUrl
  if (!url) return
  debugResultCache.set(url, {
    keyword: debugKeyword.value,
    stepStatus: { ...stepStatus },
    stepResults: JSON.parse(JSON.stringify(stepResults)),
    logs: [...logs.value],
  })
}

function restoreFromCache(targetUrl: string) {
  const cached = debugResultCache.get(targetUrl)
  if (cached) {
    debugKeyword.value = cached.keyword || '系统'
    stepStatus.search = cached.stepStatus.search
    stepStatus.bookInfo = cached.stepStatus.bookInfo
    stepStatus.toc = cached.stepStatus.toc
    stepStatus.content = cached.stepStatus.content

    stepResults.search = cached.stepResults.search
    stepResults.bookInfo = cached.stepResults.bookInfo
    stepResults.toc = cached.stepResults.toc
    stepResults.content = cached.stepResults.content

    logs.value = [...cached.logs]
  } else {
    debugKeyword.value = '系统'
    stepStatus.search = 'idle'
    stepStatus.bookInfo = 'idle'
    stepStatus.toc = 'idle'
    stepStatus.content = 'idle'
    stepResults.search = undefined
    stepResults.bookInfo = undefined
    stepResults.toc = undefined
    stepResults.content = undefined
    logs.value = []
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof RuleExecutionError) {
    return `[${error.code}] 阶段=${error.stage || 'unknown'} 字段=${error.field || 'unknown'} 模式=${error.compatibilityMode} 规则=${error.rule}: ${error.message}`
  }
  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
    return `[${String(error.code)}] ${String(error.message)}`
  }
  return error instanceof Error ? error.message : String(error)
}

const stepStatus = reactive<{
  search: 'idle' | 'running' | 'success' | 'failed'
  bookInfo: 'idle' | 'running' | 'success' | 'failed'
  toc: 'idle' | 'running' | 'success' | 'failed'
  content: 'idle' | 'running' | 'success' | 'failed'
}>({
  search: 'idle',
  bookInfo: 'idle',
  toc: 'idle',
  content: 'idle',
})

const stepResults = reactive<{
  search?: { count: number; time: number; books: SearchResult[] }
  bookInfo?: { name: string; author: string; intro: string; tocUrl: string; time: number }
  toc?: { totalChapters: number; firstChapter: TocItem | null; lastChapter: TocItem | null; time: number }
  content?: { charCount: number; preview: string; time: number }
}>({})

const activeSessionId = ref(0)

watch(
  () => props.source?.bookSourceUrl,
  (newUrl, oldUrl) => {
    // 切换书源时递增会话号，立即作废进行中的调试回调，避免旧源污染新源状态
    activeSessionId.value++
    isDebugging.value = false

    if (oldUrl && oldUrl !== newUrl) {
      saveToCache(oldUrl)
    }
    if (newUrl) {
      restoreFromCache(newUrl)
    }
  },
  { immediate: true }
)

function appendLog(tag: string, message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') {
  const now = new Date()
  const time = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0')
  logs.value.push({ time, tag, message, type })
  nextTick(() => {
    if (consoleBoxRef.value) {
      consoleBoxRef.value.scrollTop = consoleBoxRef.value.scrollHeight
    }
  })
}

function getStepClass(step: 'search' | 'bookInfo' | 'toc' | 'content') {
  return `step-${stepStatus[step]}`
}

function getStepStatusText(step: 'search' | 'bookInfo' | 'toc' | 'content') {
  switch (stepStatus[step]) {
    case 'running':
      return '解析中...'
    case 'success':
      return '✓ 成功'
    case 'failed':
      return '✕ 失败'
    default:
      return '未执行'
  }
}

const startDebug = async () => {
  if (!props.source) return
  const kw = debugKeyword.value.trim()
  if (!kw) {
    ElMessage.warning('请输入调试关键词')
    return
  }

  const currentSession = ++activeSessionId.value
  const targetSource = props.source

  isDebugging.value = true
  logs.value = []
  stepStatus.search = 'idle'
  stepStatus.bookInfo = 'idle'
  stepStatus.toc = 'idle'
  stepStatus.content = 'idle'
  stepResults.search = undefined
  stepResults.bookInfo = undefined
  stepResults.toc = undefined
  stepResults.content = undefined

  appendLog('INIT', `开始调试书源: ${targetSource.bookSourceName} (${targetSource.bookSourceUrl})`)
  appendLog('INIT', `调试关键词: "${kw}"`)
  appendLog('INIT', `规则编译模式: ${targetSource.webReaderCompatibilityMode || 'legado'}`)
  appendLog('INIT', `WebView 通道: ${targetSource.useWebView ? '已启用' : '未启用'}`)
  const compatibility = inspectSourceCompatibility(targetSource)
  appendLog(
    'COMPAT',
    `兼容状态: ${compatibility.status}，发现 ${compatibility.issues.length} 个问题`,
    compatibility.status === 'supported' ? 'success' : 'warn'
  )
  compatibility.issues.forEach(issue => appendLog('COMPAT', `[${issue.code}] ${issue.path}: ${issue.message}`, 'warn'))

  const engine = new SourceEngine()

  try {
    // 1. 搜索测试
    stepStatus.search = 'running'
    const parsedReq = parseSearchUrl(targetSource.searchUrl || '', kw, targetSource)
    appendLog('SEARCH', `发起 ${parsedReq.method} 搜索请求 => ${parsedReq.url}`)

    const searchStart = Date.now()
    const searchResults = await engine.search(targetSource, kw, (info) => {
      if (currentSession !== activeSessionId.value) return
      const channelTag = info.channel === 'webview' ? '[WebView]' : '[reqwest]'
      appendLog('HTTP', `${channelTag} HTTP 响应状态: ${info.status}, 目标地址: ${info.finalUrl}, 大小: ${(info.bodyLength / 1024).toFixed(1)} KB`)
    }).catch((err: unknown) => {
      if (currentSession !== activeSessionId.value) return []
      stepStatus.search = 'failed'
      appendLog('ERROR', `网络请求或解析异常: ${errorMessage(err)}`, 'error')
      if (err instanceof CloudflareChallengeError) {
        appendLog('CF_CHALLENGE', '【诊断结果】源站要求浏览器完成 Cloudflare 访问验证。', 'warn')
        if (err.diagnostics.cfRay) {
          appendLog('CF_CHALLENGE', `cf-ray: ${err.diagnostics.cfRay}`, 'warn')
        }
        if (err.diagnostics.cfMitigated) {
          appendLog('CF_CHALLENGE', `cf-mitigated: ${err.diagnostics.cfMitigated}`, 'warn')
        }
        if (!targetSource.useWebView) {
          appendLog('CF_CHALLENGE', '建议：请在「网页验证」中启用 WebView 通道，让请求通过真实浏览器会话执行。', 'warn')
        }
      } else if (errorMessage(err).includes('404') || errorMessage(err).includes('403') || errorMessage(err).includes('500')) {
        appendLog('DIAGNOSE', '【诊断结果】源站服务返回异常状态码，此书源的搜索接口可能已失效或被目标站拦截。', 'warn')
      }
      throw err
    })

    if (currentSession !== activeSessionId.value) return

    const searchTime = Date.now() - searchStart

    if (searchResults && searchResults.length > 0) {
      stepStatus.search = 'success'
      stepResults.search = { count: searchResults.length, time: searchTime, books: searchResults }
      appendLog('SEARCH', `搜索成功! 共解析出 ${searchResults.length} 本书籍 (${searchTime}ms)`, 'success')
      searchResults.slice(0, 3).forEach((b, i) => {
        appendLog('SEARCH', `[${i + 1}] 《${b.name}》 ${b.author ? '作者:' + b.author : ''} => ${b.bookUrl}`)
      })
    } else {
      stepStatus.search = 'failed'
      appendLog('SEARCH', `搜索完成，但未能解析到任何书籍 (${searchTime}ms)`, 'warn')
      appendLog('DIAGNOSE', '【诊断结果】网站请求返回成功，但解析规则未能提取出书籍列表（可能是无相关搜索结果，或该书源的 bookList 规则与当前网页结构不匹配）。', 'info')
      return
    }

    const firstBook = searchResults[0]
    let tocUrl = firstBook.bookUrl

    // 2. 详情页测试
    if (targetSource.ruleBookInfo && firstBook.bookUrl) {
      stepStatus.bookInfo = 'running'
      appendLog('BOOK_INFO', `请求详情页: ${firstBook.bookUrl}`)
      const infoStart = Date.now()
      try {
        const info = await engine.getBookInfo(targetSource, firstBook.bookUrl)
        if (currentSession !== activeSessionId.value) return
        const infoTime = Date.now() - infoStart
        stepStatus.bookInfo = 'success'
        if (info.tocUrl) tocUrl = info.tocUrl
        stepResults.bookInfo = {
          name: info.name || firstBook.name,
          author: info.author || firstBook.author,
          intro: info.intro || '',
          tocUrl: info.tocUrl || firstBook.bookUrl,
          time: infoTime,
        }
        appendLog('BOOK_INFO', `详情解析成功: 《${info.name}》 目录URL: ${info.tocUrl || '默认原地址'} (${infoTime}ms)`, 'success')
      } catch (err: unknown) {
        if (currentSession !== activeSessionId.value) return
        stepStatus.bookInfo = 'failed'
        appendLog('BOOK_INFO', `详情解析失败: ${errorMessage(err)}`, 'error')
      }
    } else {
      stepStatus.bookInfo = 'success'
      appendLog('BOOK_INFO', '未配置详情规则或直接使用搜索结果，跳过详情解析')
    }

    if (currentSession !== activeSessionId.value) return

    // 3. 目录测试
    if (tocUrl) {
      stepStatus.toc = 'running'
      appendLog('TOC', `请求目录页: ${tocUrl}`)
      const tocStart = Date.now()
      try {
        const chapters = await engine.getToc(targetSource, tocUrl, (pageInfo) => {
          if (currentSession !== activeSessionId.value) return
          appendLog('TOC', `目录分页拉取成功: 第 ${pageInfo.page} 页 => ${pageInfo.url} (本页解析出 ${pageInfo.count} 章)`)
        })
        if (currentSession !== activeSessionId.value) return
        const tocTime = Date.now() - tocStart
        if (chapters && chapters.length > 0) {
          stepStatus.toc = 'success'
          stepResults.toc = {
            totalChapters: chapters.length,
            firstChapter: chapters[0],
            lastChapter: chapters[chapters.length - 1],
            time: tocTime,
          }
          appendLog('TOC', `目录解析成功! 共 ${chapters.length} 章 (${tocTime}ms)`, 'success')
          appendLog('TOC', `首章: ${chapters[0].name} => ${chapters[0].url}`)
          appendLog('TOC', `末章: ${chapters[chapters.length - 1].name}`)

          // 4. 正文测试
          const firstChapterUrl = chapters[0].url
          if (firstChapterUrl) {
            stepStatus.content = 'running'
            appendLog('CONTENT', `请求首章正文: ${firstChapterUrl}`)
            const contentStart = Date.now()
            try {
              const payload = await engine.getContent(targetSource, firstChapterUrl, (pageInfo) => {
                if (currentSession !== activeSessionId.value) return
                appendLog('CONTENT', `正文分页拉取成功: 第 ${pageInfo.page} 页 => ${pageInfo.url}`)
              })
              if (currentSession !== activeSessionId.value) return
              const text = payload.type === 'text'
                ? payload.text
                : payload.images.map(image => image.url).join('\n')
              const contentTime = Date.now() - contentStart
              stepStatus.content = 'success'
              stepResults.content = {
                charCount: text.length,
                preview: text.slice(0, 200) + (text.length > 200 ? '...' : ''),
                time: contentTime,
              }
              appendLog('CONTENT', payload.type === 'images'
                ? `图片解析成功! 共 ${payload.images.length} 张 (${contentTime}ms)`
                : `正文解析成功! 字数: ${text.length} (${contentTime}ms)`, 'success')
              appendLog('CONTENT', `正文预览:\n${text.slice(0, 120)}...`)
            } catch (err: unknown) {
              if (currentSession !== activeSessionId.value) return
              stepStatus.content = 'failed'
              appendLog('CONTENT', `正文解析失败: ${errorMessage(err)}`, 'error')
            }
          }
        } else {
          stepStatus.toc = 'failed'
          appendLog('TOC', `未解析到任何目录章节 (${tocTime}ms)`, 'warn')
        }
      } catch (err: unknown) {
        if (currentSession !== activeSessionId.value) return
        stepStatus.toc = 'failed'
        appendLog('TOC', `目录解析失败: ${errorMessage(err)}`, 'error')
      }
    }

    if (currentSession !== activeSessionId.value) return
    appendLog('DONE', '书源全流程调试完成!', 'success')
    ElMessage.success('调试完成')
  } catch (err: unknown) {
    if (currentSession !== activeSessionId.value) return
    appendLog('FATAL', `调试中止: ${errorMessage(err)}`, 'error')
  } finally {
    if (currentSession === activeSessionId.value) {
      isDebugging.value = false
      saveToCache(targetSource.bookSourceUrl)
    }
  }
}

const copyLogs = async () => {
  if (logs.value.length === 0) {
    ElMessage.info('暂无日志')
    return
  }
  const text = logs.value.map(l => `[${l.time}] [${l.tag}] ${l.message}`).join('\n')
  try {
    await copyTextToClipboard(text)
    ElMessage.success('调试日志已复制到剪贴板')
  } catch (err: any) {
    ElMessage.error(err?.message || '复制失败')
  }
}

const stopDebug = () => {
  if (!isDebugging.value) return
  activeSessionId.value++
  isDebugging.value = false

  for (const step of ['search', 'bookInfo', 'toc', 'content'] as const) {
    if (stepStatus[step] === 'running') {
      stepStatus[step] = 'failed'
    }
  }

  appendLog('ABORT', '用户已主动中止调试', 'warn')
  ElMessage.info('已停止调试')
}

const toggleDebug = () => {
  if (isDebugging.value) {
    stopDebug()
  } else {
    startDebug()
  }
}
</script>

<style scoped>
.source-debug-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.debug-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 12px;
  margin-bottom: 16px;
  gap: 16px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.debug-keyword-input {
  width: 260px;
}

.debug-content-body {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}

.sharp-num {
  border-radius: 0 !important;
}


/* 分步卡片网格 */
.debug-steps {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.step-card {
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  padding: 12px;
  transition: all 0.2s ease;
}

.step-card.step-running {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 8px rgba(64, 158, 255, 0.2);
}

.step-card.step-success {
  border-color: var(--el-color-success-light-5);
  background: var(--el-color-success-light-9);
}

.step-card.step-failed {
  border-color: var(--el-color-danger-light-5);
  background: var(--el-color-danger-light-9);
}

.step-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.step-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.step-num {
  width: 18px;
  height: 18px;
  background: var(--el-fill-color-darker);
  color: var(--el-text-color-primary);
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.step-success .step-num {
  background: var(--el-color-success);
  color: #fff;
}

.step-failed .step-num {
  background: var(--el-color-danger);
  color: #fff;
}

.step-status {
  font-size: 12px;
  font-weight: 500;
}

.step-running .step-status {
  color: var(--el-color-primary);
}

.step-success .step-status {
  color: var(--el-color-success);
}

.step-failed .step-status {
  color: var(--el-color-danger);
}

.step-detail {
  font-size: 12px;
  color: var(--el-text-color-regular);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.detail-row .label {
  color: var(--el-text-color-secondary);
}

.time-cost {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.search-preview-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}

.search-preview-item {
  background: rgba(0, 0, 0, 0.08);
  padding: 6px 8px;
  border: 1px solid var(--el-border-color-lighter);
}

.bk-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.bk-author {
  font-weight: normal;
  color: var(--el-text-color-secondary);
  margin-left: 4px;
  font-size: 11px;
}

.bk-url {
  font-size: 11px;
  color: var(--el-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bk-last {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.url-text {
  color: var(--el-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
}

.intro-text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  line-height: 1.4;
}

.content-preview {
  margin-top: 4px;
  background: rgba(0, 0, 0, 0.08);
  padding: 6px 8px;
  border: 1px solid var(--el-border-color-lighter);
  line-height: 1.5;
  white-space: pre-wrap;
  max-height: 120px;
  overflow-y: auto;
  font-size: 11px;
}

/* 控制台日志 */
.debug-console-section {
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color-overlay);
  padding: 12px;
}

.console-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.console-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.console-box {
  height: 220px;
  background: #141416;
  border: 1px solid var(--el-border-color-lighter);
  padding: 8px 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  line-height: 1.6;
  overflow-y: auto;
  color: #cfd3dc;
}

.console-empty {
  color: #6c6e72;
  font-style: italic;
  padding: 8px 0;
}

.log-line {
  display: flex;
  gap: 8px;
  margin-bottom: 2px;
  word-break: break-all;
}

.log-time {
  color: #6c6e72;
  flex-shrink: 0;
}

.log-tag {
  color: #409eff;
  font-weight: 600;
  flex-shrink: 0;
}

.log-msg {
  flex: 1;
}

.log-success .log-tag {
  color: #67c23a;
}
.log-success .log-msg {
  color: #e5eaf3;
}

.log-warn .log-tag {
  color: #e6a23c;
}
.log-warn .log-msg {
  color: #e6a23c;
}

.log-error .log-tag {
  color: #f56c6c;
}
.log-error .log-msg {
  color: #f56c6c;
}

@media screen and (max-width: 900px) {
  .debug-steps {
    grid-template-columns: 1fr;
  }
}
</style>
