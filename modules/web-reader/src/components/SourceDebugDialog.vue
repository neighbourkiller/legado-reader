<template>
  <el-dialog
    :model-value="visible"
    title="书源调试控制台"
    width="800px"
    center
    align-center
    destroy-on-close
    class="source-debug-dialog"
    @update:model-value="onDialogVisibleChange"
  >
    <div class="debug-dialog-body" v-if="source">
      <!-- 书源头部信息 -->
      <div class="source-debug-header">
        <div class="source-debug-meta">
          <span class="meta-name">{{ source.bookSourceName }}</span>
          <span class="meta-group" v-if="source.bookSourceGroup">{{ source.bookSourceGroup }}</span>
          <span class="meta-url" :title="source.bookSourceUrl">{{ source.bookSourceUrl }}</span>
          <el-tag size="small" effect="plain">{{ source.webReaderCompatibilityMode || 'legado' }} 模式</el-tag>
        </div>
        <div class="search-debug-bar">
          <el-input
            v-model="debugKeyword"
            placeholder="输入调试关键词..."
            clearable
            style="width: 260px"
            @keyup.enter="startDebug"
          />
          <el-button type="warning" plain @click="showAuthDialog = true">
            <el-icon><Key /></el-icon>
            <span>网页验证 (CF盾)</span>
          </el-button>
          <el-button type="primary" :loading="isDebugging" @click="startDebug">
            <el-icon><VideoPlay /></el-icon>
            {{ isDebugging ? '调试中...' : '开始调试' }}
          </el-button>
        </div>
      </div>

      <!-- 分步状态展示 -->
      <div class="debug-steps">
        <div class="step-card" :class="getStepClass('search')">
          <div class="step-header">
            <div class="step-title">
              <span class="step-num">1</span>
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
                class="search-preview-item"
              >
                <div class="bk-title">{{ bk.name }} <span class="bk-author">{{ bk.author }}</span></div>
                <div class="bk-url" :title="bk.bookUrl">{{ bk.bookUrl }}</div>
                <div class="bk-last" v-if="bk.lastChapter">最新: {{ bk.lastChapter }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="step-card" :class="getStepClass('bookInfo')">
          <div class="step-header">
            <div class="step-title">
              <span class="step-num">2</span>
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

        <div class="step-card" :class="getStepClass('toc')">
          <div class="step-header">
            <div class="step-title">
              <span class="step-num">3</span>
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

        <div class="step-card" :class="getStepClass('content')">
          <div class="step-header">
            <div class="step-title">
              <span class="step-num">4</span>
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

      <!-- 控制台日志 -->
      <div class="debug-console-section">
        <div class="console-header">
          <span class="console-title">调试运行日志与诊断</span>
          <div class="console-actions">
            <el-button text size="small" @click="copyLogs">复制日志</el-button>
            <el-button text size="small" @click="logs = []">清空日志</el-button>
          </div>
        </div>
        <div class="console-box" ref="consoleBoxRef">
          <div v-if="logs.length === 0" class="console-empty">
            点击“开始调试”按钮查看实时请求与解析诊断日志...
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

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="emit('update:visible', false)">关闭</el-button>
      </div>
    </template>

    <!-- 网页验证与 Cookie 注入 Dialog -->
    <SourceAuthDialog
      v-model="showAuthDialog"
      :source="source"
      @saved="handleAuthSaved"
    />
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { VideoPlay, Key } from '@element-plus/icons-vue'
import type { BookSource, SearchResult } from '@/source/types/BookSource'
import type { TocItem } from '@/source/engine/TocParser'
import { SourceEngine, parseSearchUrl, CloudflareChallengeError } from '@/source/engine/SourceEngine'
import SourceAuthDialog from './SourceAuthDialog.vue'
import { inspectSourceCompatibility } from '@/source/engine/Compatibility'
import { RuleExecutionError } from '@/source/engine/RuleTypes'

const props = defineProps<{
  visible: boolean
  source: BookSource | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
}>()

const showAuthDialog = ref(false)

function handleAuthSaved() {
  appendLog('AUTH', '已成功保存并注入 Cookie 与 User-Agent，可重新点击“开始调试”测试！', 'success')
}

function onDialogVisibleChange(val: boolean) {
  emit('update:visible', val)
}

const debugKeyword = ref('剑来')
const isDebugging = ref(false)
const consoleBoxRef = ref<HTMLElement | null>(null)

interface LogItem {
  time: string
  tag: string
  type: 'info' | 'success' | 'warn' | 'error'
  message: string
}

const logs = ref<LogItem[]>([])

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

  appendLog('INIT', `开始调试书源: ${props.source.bookSourceName} (${props.source.bookSourceUrl})`)
  appendLog('INIT', `调试关键词: "${kw}"`)
  appendLog('INIT', `规则编译模式: ${props.source.webReaderCompatibilityMode || 'legado'}`)
  appendLog('INIT', `WebView 通道: ${props.source.useWebView ? '已启用' : '未启用'}`)
  const compatibility = inspectSourceCompatibility(props.source)
  appendLog('COMPAT', `兼容状态: ${compatibility.status}，发现 ${compatibility.issues.length} 个问题`,
    compatibility.status === 'supported' ? 'success' : 'warn')
  compatibility.issues.forEach(issue => appendLog('COMPAT', `[${issue.code}] ${issue.path}: ${issue.message}`, 'warn'))

  const engine = new SourceEngine()

  try {
    // 1. 搜索测试
    stepStatus.search = 'running'
    const parsedReq = parseSearchUrl(props.source.searchUrl || '', kw, props.source)
    appendLog('SEARCH', `发起 ${parsedReq.method} 搜索请求 => ${parsedReq.url}`)

    const searchStart = Date.now()
    let httpInfo: { status: number; finalUrl: string; bodyLength: number; channel?: string } | null = null

    const searchResults = await engine.search(props.source, kw, (info) => {
      httpInfo = info
      const channelTag = info.channel === 'webview' ? '[WebView]' : '[reqwest]'
      appendLog('HTTP', `${channelTag} HTTP 响应状态: ${info.status}, 目标地址: ${info.finalUrl}, 大小: ${(info.bodyLength / 1024).toFixed(1)} KB`)
    }).catch((err: unknown) => {
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
        if (!props.source?.useWebView) {
          appendLog('CF_CHALLENGE', '建议：请在「网页验证」中启用 WebView 通道，让请求通过真实浏览器会话执行。', 'warn')
        }
      } else if (errorMessage(err).includes('404') || errorMessage(err).includes('403') || errorMessage(err).includes('500')) {
        appendLog('DIAGNOSE', `【诊断结果】源站服务返回异常状态码，此书源的搜索接口可能已失效或被目标站拦截。`, 'warn')
      }
      throw err
    })

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
      appendLog('DIAGNOSE', `【诊断结果】网站请求返回成功，但解析规则未能提取出书籍列表（可能是无相关搜索结果，或该书源的 bookList 规则与当前网页结构不匹配）。`, 'info')
      return
    }

    const firstBook = searchResults[0]
    let tocUrl = firstBook.bookUrl

    // 2. 详情页测试 (如果存在详情页规则)
    if (props.source.ruleBookInfo && firstBook.bookUrl) {
      stepStatus.bookInfo = 'running'
      appendLog('BOOK_INFO', `请求详情页: ${firstBook.bookUrl}`)
      const infoStart = Date.now()
      try {
        const info = await engine.getBookInfo(props.source, firstBook.bookUrl)
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
        stepStatus.bookInfo = 'failed'
        appendLog('BOOK_INFO', `详情解析失败: ${errorMessage(err)}`, 'error')
      }
    } else {
      stepStatus.bookInfo = 'success'
      appendLog('BOOK_INFO', '未配置详情规则或直接使用搜索结果，跳过详情解析')
    }

    // 3. 目录测试
    if (tocUrl) {
      stepStatus.toc = 'running'
      appendLog('TOC', `请求目录页: ${tocUrl}`)
      const tocStart = Date.now()
      try {
        const chapters = await engine.getToc(props.source, tocUrl, (pageInfo) => {
          appendLog('TOC', `目录分页拉取成功: 第 ${pageInfo.page} 页 => ${pageInfo.url} (本页解析出 ${pageInfo.count} 章)`)
        })
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
              const payload = await engine.getContent(props.source, firstChapterUrl, (pageInfo) => {
                appendLog('CONTENT', `正文分页拉取成功: 第 ${pageInfo.page} 页 => ${pageInfo.url}`)
              })
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
              stepStatus.content = 'failed'
              appendLog('CONTENT', `正文解析失败: ${errorMessage(err)}`, 'error')
            }
          }
        } else {
          stepStatus.toc = 'failed'
          appendLog('TOC', `未解析到任何目录章节 (${tocTime}ms)`, 'warn')
        }
      } catch (err: unknown) {
        stepStatus.toc = 'failed'
        appendLog('TOC', `目录解析失败: ${errorMessage(err)}`, 'error')
      }
    }

    appendLog('DONE', '书源全流程调试完成!', 'success')
    ElMessage.success('调试完成')
  } catch (err: unknown) {
    appendLog('FATAL', `调试中止: ${errorMessage(err)}`, 'error')
  } finally {
    isDebugging.value = false
  }
}

const copyLogs = () => {
  if (logs.value.length === 0) {
    ElMessage.info('暂无日志')
    return
  }
  const text = logs.value.map(l => `[${l.time}] [${l.tag}] ${l.message}`).join('\n')
  navigator.clipboard.writeText(text)
  ElMessage.success('调试日志已复制到剪贴板')
}
</script>

<style scoped>
.source-debug-dialog :deep(.el-dialog__body) {
  padding: 10px 20px;
  max-height: 75vh;
  overflow-y: auto;
}

.source-debug-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  margin-bottom: 16px;
  gap: 16px;
  flex-wrap: wrap;
}

.source-debug-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 240px;
}

.meta-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.meta-group {
  font-size: 11px;
  color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
  padding: 1px 6px;
  border-radius: 4px;
}

.meta-url {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-debug-bar {
  display: flex;
  gap: 8px;
  align-items: center;
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
  border-radius: 8px;
  padding: 12px;
  transition: all 0.2s ease;
}

.step-card.step-running {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 8px rgba(var(--legado-primary-rgb), 0.2);
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
  border-radius: 50%;
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
  background: rgba(0, 0, 0, 0.04);
  padding: 4px 6px;
  border-radius: 4px;
}

.bk-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.bk-author {
  font-weight: normal;
  color: var(--el-text-color-secondary);
}

.bk-url {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bk-last {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.content-preview {
  background: rgba(0, 0, 0, 0.04);
  padding: 6px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.4;
  max-height: 60px;
  overflow: hidden;
}

/* 控制台日志 */
.debug-console-section {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
}

.console-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--el-fill-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.console-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.console-box {
  height: 180px;
  overflow-y: auto;
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 10px 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
}

.console-empty {
  color: #6a6a6a;
  text-align: center;
  margin-top: 60px;
}

.log-line {
  display: flex;
  gap: 6px;
  word-break: break-all;
}

.log-time {
  color: #6a6a6a;
  flex-shrink: 0;
}

.log-tag {
  color: #4ec9b0;
  font-weight: 600;
  flex-shrink: 0;
}

.log-msg {
  color: #d4d4d4;
  white-space: pre-wrap;
}

.log-success .log-msg {
  color: #67c23a;
}

.log-warn .log-msg {
  color: #e6a23c;
}

.log-error .log-msg {
  color: #f56c6c;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
}

@media screen and (max-width: 650px) {
  .debug-steps {
    grid-template-columns: 1fr;
  }
}
</style>
