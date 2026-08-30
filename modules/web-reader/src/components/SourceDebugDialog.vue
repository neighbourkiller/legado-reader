<template>
  <el-dialog
    :model-value="visible"
    title="书源调试控制台"
    width="860px"
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
          <div class="input-wrapper">
            <el-input
              v-model="debugKeyword"
              placeholder="关键词 / 详情URL / ++目录URL / --正文URL / 分类::发现URL"
              clearable
              class="debug-dialog-input"
              @keyup.enter="!isDebugging && startDebug()"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>

            <!-- 帮助提示气泡 -->
            <el-popover
              placement="bottom-start"
              :width="360"
              trigger="hover"
              popper-class="debug-help-popper"
            >
              <template #reference>
                <el-button text circle class="help-btn">
                  <el-icon><QuestionFilled /></el-icon>
                </el-button>
              </template>
              <div class="debug-help-content">
                <div class="help-title">调试指令语法说明</div>
                <ul class="help-list">
                  <li>
                    <span class="help-badge search">搜索</span>
                    <span class="help-desc">普通文本：如 <code>系统</code>、<code>校园</code></span>
                  </li>
                  <li>
                    <span class="help-badge explore">发现</span>
                    <span class="help-desc">含 <code>::</code>：如 <code>月票榜::/rank/yuepiao</code></span>
                  </li>
                  <li>
                    <span class="help-badge info">详情</span>
                    <span class="help-desc">普通网址：如 <code>https://example.com/book/123</code></span>
                  </li>
                  <li>
                    <span class="help-badge toc">目录</span>
                    <span class="help-desc">以 <code>++</code> 开头：如 <code>++https://example.com/read/123</code></span>
                  </li>
                  <li>
                    <span class="help-badge content">正文</span>
                    <span class="help-desc">以 <code>--</code> 开头：如 <code>--https://example.com/ch/123/1</code></span>
                  </li>
                </ul>
              </div>
            </el-popover>

            <!-- 发现分类下拉 -->
            <el-dropdown
              v-if="exploreOptions.length > 0"
              trigger="click"
              @command="handleSelectExplore"
            >
              <el-button size="default" title="选择书源预设的发现分类">
                <el-icon><Compass /></el-icon>
                <span>发现分类</span>
                <el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu class="explore-dropdown-menu">
                  <el-dropdown-item
                    v-for="(item, idx) in exploreOptions"
                    :key="idx"
                    :command="item.fullKey"
                  >
                    <span class="explore-item-title">{{ item.title }}</span>
                    <span class="explore-item-url">{{ item.url }}</span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>

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
              <span>{{ currentDebugMode === 'explore' ? '发现书籍 (Explore)' : '搜索书籍 (Search)' }}</span>
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
import { ref, reactive, computed, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { VideoPlay, Key, Search, QuestionFilled, Compass, ArrowDown } from '@element-plus/icons-vue'
import type { BookSource, SearchResult } from '@/source/types/BookSource'
import type { TocItem } from '@/source/engine/TocParser'
import { SourceEngine, parseSearchUrl, CloudflareChallengeError, SecurityChallengeError } from '@/source/engine/SourceEngine'
import { getTransport } from '@/source/transport'
import { parseDebugInput, parseExploreUrlOptions, type DebugInputType } from '@/source/engine/SourceDebugHelper'
import SourceAuthDialog from './SourceAuthDialog.vue'
import { inspectSourceCompatibility } from '@/source/engine/Compatibility'
import { RuleExecutionError } from '@/source/engine/RuleTypes'
import { copyTextToClipboard } from '@/platform/clipboard'

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

const debugKeyword = ref('系统')
const currentDebugMode = ref<DebugInputType>('search')
const isDebugging = ref(false)
const consoleBoxRef = ref<HTMLElement | null>(null)

const exploreOptions = computed(() => {
  return parseExploreUrlOptions(props.source?.exploreUrl)
})

function handleSelectExplore(fullKey: string) {
  debugKeyword.value = fullKey
  ElMessage.success(`已填入发现分类: ${fullKey}`)
}

interface LogItem {
  time: string
  tag: string
  type: 'info' | 'success' | 'warn' | 'error'
  message: string
}

const logs = ref<LogItem[]>([])

type StepStatus = 'idle' | 'running' | 'success' | 'failed' | 'skipped'

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
  search: StepStatus
  bookInfo: StepStatus
  toc: StepStatus
  content: StepStatus
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
    case 'skipped':
      return '已跳过'
    default:
      return '未执行'
  }
}

const startDebug = async () => {
  if (!props.source) return
  const rawInput = debugKeyword.value.trim()
  if (!rawInput) {
    ElMessage.warning('请输入调试内容')
    return
  }

  const parsed = parseDebugInput(rawInput)
  currentDebugMode.value = parsed.type

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
  appendLog('INIT', `调试输入: "${rawInput}" (模式: ${parsed.type})`)
  appendLog('INIT', `规则编译模式: ${props.source.webReaderCompatibilityMode || 'legado'}`)
  appendLog('INIT', `WebView 通道: ${props.source.useWebView ? '已启用' : '未启用'}`)
  const compatibility = inspectSourceCompatibility(props.source)
  appendLog('COMPAT', `兼容状态: ${compatibility.status}，验证=${compatibility.verificationStatus}，引擎=v${compatibility.engineVersion}，能力=${compatibility.capabilities?.join(',') || 'none'}，发现 ${compatibility.issues.length} 个问题`,
    compatibility.status === 'supported' ? 'success' : 'warn')
  compatibility.issues.forEach(issue => appendLog('COMPAT', `[${issue.code}] ${issue.path}: ${issue.message}`, 'warn'))

  const engine = new SourceEngine()
  const targetSource = props.source

  try {
    let targetBookUrl = ''
    let targetTocUrl = ''
    let targetChapterUrl = ''

    // 1. 搜索或发现
    if (parsed.type === 'search') {
      const kw = parsed.payload.keyword || rawInput
      stepStatus.search = 'running'
      const parsedReq = parseSearchUrl(targetSource.searchUrl || '', kw, targetSource)
      appendLog('SEARCH', `发起 ${parsedReq.method} 搜索请求 => ${parsedReq.url}`)

      const searchStart = Date.now()
      const searchResults = await engine.search(targetSource, kw, (info) => {
        const channelTag = info.channel === 'webview' ? '[WebView]' : '[reqwest]'
        appendLog('HTTP', `${channelTag} HTTP 响应状态: ${info.status}, 目标地址: ${info.finalUrl}, 大小: ${(info.bodyLength / 1024).toFixed(1)} KB`)
      }).catch((err: unknown) => {
        stepStatus.search = 'failed'
        handleErrorChallenge(err, targetSource)
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
        targetBookUrl = searchResults[0].bookUrl
        const possibleTocUrl = (searchResults[0] as unknown as { tocUrl?: string }).tocUrl
        if (possibleTocUrl) {
          targetTocUrl = possibleTocUrl
        }
      } else {
        stepStatus.search = 'failed'
        appendLog('SEARCH', `搜索完成，但未能解析到任何书籍 (${searchTime}ms)`, 'warn')
        appendLog('DIAGNOSE', `【诊断结果】网站请求返回成功，但解析规则未能提取出书籍列表（可能是无相关搜索结果，或该书源的 bookList 规则与当前网页结构不匹配）。`, 'info')
        return
      }
    } else if (parsed.type === 'explore') {
      const exploreUrl = parsed.payload.exploreUrl || ''
      const exploreName = parsed.payload.exploreName || '发现'
      stepStatus.search = 'running'
      appendLog('EXPLORE', `开始访问发现页 [${exploreName}]: ${exploreUrl}`)

      const exploreStart = Date.now()
      const exploreResults = await engine.explore(targetSource, exploreUrl, 1, (info) => {
        const channelTag = info.channel === 'webview' ? '[WebView]' : '[reqwest]'
        appendLog('HTTP', `${channelTag} HTTP 响应状态: ${info.status}, 目标地址: ${info.finalUrl}, 大小: ${(info.bodyLength / 1024).toFixed(1)} KB`)
      }).catch((err: unknown) => {
        stepStatus.search = 'failed'
        handleErrorChallenge(err, targetSource)
        throw err
      })

      const exploreTime = Date.now() - exploreStart

      if (exploreResults && exploreResults.length > 0) {
        stepStatus.search = 'success'
        stepResults.search = { count: exploreResults.length, time: exploreTime, books: exploreResults }
        appendLog('EXPLORE', `发现页解析成功! 共解析出 ${exploreResults.length} 本书籍 (${exploreTime}ms)`, 'success')
        exploreResults.slice(0, 3).forEach((b, i) => {
          appendLog('EXPLORE', `[${i + 1}] 《${b.name}》 ${b.author ? '作者:' + b.author : ''} => ${b.bookUrl}`)
        })
        targetBookUrl = exploreResults[0].bookUrl
        const possibleTocUrl = (exploreResults[0] as unknown as { tocUrl?: string }).tocUrl
        if (possibleTocUrl) {
          targetTocUrl = possibleTocUrl
        }
      } else {
        stepStatus.search = 'failed'
        appendLog('EXPLORE', `发现页解析完成，但未能提取到书籍列表 (${exploreTime}ms)`, 'warn')
        return
      }
    } else {
      stepStatus.search = 'skipped'
      if (parsed.type === 'bookInfo') {
        targetBookUrl = parsed.payload.bookUrl!
      } else if (parsed.type === 'toc') {
        targetTocUrl = parsed.payload.tocUrl!
      } else if (parsed.type === 'content') {
        targetChapterUrl = parsed.payload.chapterUrl!
      }
    }

    // 2. 详情页测试
    if (parsed.type === 'search' || parsed.type === 'explore' || parsed.type === 'bookInfo') {
      if (targetBookUrl) {
        stepStatus.bookInfo = 'running'
        appendLog('BOOK_INFO', `请求详情页: ${targetBookUrl}`)
        const infoStart = Date.now()
        try {
          const info = await engine.getBookInfo(targetSource, targetBookUrl)
          const infoTime = Date.now() - infoStart
          stepStatus.bookInfo = 'success'
          if (info.tocUrl) {
            targetTocUrl = info.tocUrl
          } else if (!targetTocUrl) {
            targetTocUrl = targetBookUrl
          }
          stepResults.bookInfo = {
            name: info.name || '未知书名',
            author: info.author || '未知作者',
            intro: info.intro || '',
            tocUrl: targetTocUrl,
            time: infoTime,
          }
          appendLog('BOOK_INFO', `详情解析成功: 《${info.name || '未知书名'}》 目录URL: ${targetTocUrl} (${infoTime}ms)`, 'success')
        } catch (err: unknown) {
          stepStatus.bookInfo = 'failed'
          appendLog('BOOK_INFO', `详情解析失败: ${errorMessage(err)}`, 'error')
          if (!targetTocUrl) return
        }
      } else {
        stepStatus.bookInfo = 'success'
        appendLog('BOOK_INFO', '未提供详情页链接，跳过详情解析')
      }
    } else {
      stepStatus.bookInfo = 'skipped'
    }

    // 3. 目录测试
    if (parsed.type === 'search' || parsed.type === 'explore' || parsed.type === 'bookInfo' || parsed.type === 'toc') {
      if (targetTocUrl) {
        stepStatus.toc = 'running'
        appendLog('TOC', `请求目录页: ${targetTocUrl}`)
        const tocStart = Date.now()
        try {
          const chapters = await engine.getToc(targetSource, targetTocUrl, (pageInfo) => {
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
            targetChapterUrl = chapters[0].url
          } else {
            stepStatus.toc = 'failed'
            appendLog('TOC', `未解析到任何目录章节 (${tocTime}ms)`, 'warn')
            return
          }
        } catch (err: unknown) {
          stepStatus.toc = 'failed'
          appendLog('TOC', `目录解析失败: ${errorMessage(err)}`, 'error')
          return
        }
      } else {
        stepStatus.toc = 'failed'
        appendLog('TOC', '未获取到目录链接，无法解析目录', 'error')
        return
      }
    } else {
      stepStatus.toc = 'skipped'
    }

    // 4. 正文测试
    if (targetChapterUrl) {
      stepStatus.content = 'running'
      appendLog('CONTENT', `请求首章正文: ${targetChapterUrl}`)
      const contentStart = Date.now()
      try {
        const payload = await engine.getContent(targetSource, targetChapterUrl, (pageInfo) => {
          if (pageInfo.challengeSolved) {
            appendLog('CHALLENGE', `[自动穿透] 检测到源站安全质询盾（${pageInfo.challengeTitle || '浏览器安全质询'}），后台隐藏 WebView 已自动完成穿透并同步 Cookie!`, 'success')
          } else {
            appendLog('CONTENT', `正文分页拉取成功: 第 ${pageInfo.page} 页 => ${pageInfo.url}`)
          }
        })
        const text = payload.type === 'text'
          ? payload.text
          : payload.images.map(image => image.url).join('\n')
        const contentTime = Date.now() - contentStart
        const charCount = text.length

        if (payload.type === 'text' && charCount === 0 && (!payload.embeddedImages || payload.embeddedImages.length === 0)) {
          stepStatus.content = 'failed'
          stepResults.content = {
            charCount: 0,
            preview: '',
            time: contentTime,
          }
          appendLog('CONTENT', `正文解析未通过: 提取结果为空 (0 字) (${contentTime}ms)`, 'error')
          appendLog('DIAGNOSE', '【诊断结果】正文规则未能提取出有效文字。可能是正文规则选择器不匹配，或正文需要异步 JavaScript 渲染（建议在书源编辑中启用 WebView 通道）。', 'warn')
        } else if (payload.type === 'images' && payload.images.length === 0) {
          stepStatus.content = 'failed'
          stepResults.content = {
            charCount: 0,
            preview: '',
            time: contentTime,
          }
          appendLog('CONTENT', `图片解析未通过: 未提取到任何图片 (${contentTime}ms)`, 'error')
          appendLog('DIAGNOSE', '【诊断结果】漫画正文规则未能提取出有效图片链接。', 'warn')
        } else {
          stepStatus.content = 'success'
          stepResults.content = {
            charCount,
            preview: text.slice(0, 200) + (text.length > 200 ? '...' : ''),
            time: contentTime,
          }
          appendLog('CONTENT', payload.type === 'images'
            ? `图片解析成功! 共 ${payload.images.length} 张 (${contentTime}ms)`
            : `正文解析成功! 字数: ${charCount} (${contentTime}ms)`, 'success')
          appendLog('CONTENT', `正文预览:\n${text.slice(0, 120)}...`)
        }
      } catch (err: unknown) {
        stepStatus.content = 'failed'
        if (err instanceof SecurityChallengeError) {
          appendLog('CONTENT', `正文解析失败: 触发目标网站安全质询拦截 (${err.diagnostics.title || err.diagnostics.type})`, 'error')
          appendLog('CHALLENGE', `【诊断结果】源站正文页返回了安全验证页面${err.diagnostics.title ? `（“${err.diagnostics.title}”）` : ''}。`, 'warn')
          if (err.diagnostics.snippet) {
            appendLog('RAW_PAGE', `拦截页面片段摘要:\n${err.diagnostics.snippet}`, 'info')
          }
          if (err.diagnostics.requiresManualInteraction) {
            appendLog('AUTH', '【需要验证】已自动呼出网页验证窗口，请在弹窗中完成人机验证码/滑块。完成后窗口将自动关闭并继续...', 'warn')
            try {
              const transport = await getTransport()
              const authUrl = err.diagnostics.challengeUrl || targetChapterUrl || targetSource.bookSourceUrl
              if (transport.openAuthWindow) {
                await transport.openAuthWindow(targetSource.bookSourceUrl, authUrl, '书源安全验证')

                // 开启 500ms 轮询检测，最多持续 60 秒
                const pollStart = Date.now()
                let solved = false
                while (Date.now() - pollStart < 60000 && !solved && isDebugging.value) {
                  await new Promise(r => setTimeout(r, 500))
                  if (!isDebugging.value) break
                  try {
                    if (transport.solveChallenge) {
                      const probe = await transport.solveChallenge(targetSource.bookSourceUrl, authUrl, 1000)
                      if (probe.success && probe.html) {
                        solved = true
                        break
                      }
                    }
                  } catch {
                    // 仍在验证中，继续轮询
                  }
                }

                if (solved && isDebugging.value) {
                  if (transport.closeAuthWindow) {
                    await transport.closeAuthWindow(targetSource.bookSourceUrl)
                  }
                  appendLog('AUTH', '【验证通过】已检测到网页验证完成，正在自动重试正文解析...', 'success')
                  const retryPayload = await engine.getContent(targetSource, targetChapterUrl)
                  const retryText = retryPayload.type === 'text' ? retryPayload.text : retryPayload.images.map(img => img.url).join('\n')
                  const retryCharCount = retryText.length
                  if (retryCharCount > 0 || (retryPayload.type === 'images' && retryPayload.images.length > 0)) {
                    stepStatus.content = 'success'
                    stepResults.content = {
                      charCount: retryCharCount,
                      preview: retryText.slice(0, 200) + (retryText.length > 200 ? '...' : ''),
                      time: Date.now() - pollStart,
                    }
                    appendLog('CONTENT', retryPayload.type === 'images'
                      ? `图片解析成功! 共 ${retryPayload.images.length} 张`
                      : `正文解析成功! 字数: ${retryCharCount}`, 'success')
                    appendLog('CONTENT', `正文预览:\n${retryText.slice(0, 120)}...`)
                  }
                }
              }
            } catch (authErr) {
              appendLog('AUTH', `唤起/轮询验证窗口失败: ${errorMessage(authErr)}`, 'error')
            }
          } else {
            appendLog('SUGGEST', '建议：请在「书源编辑」中启用「WebView 通道」，或在「网页验证」中完成浏览器安全验证。', 'warn')
          }
        } else {
          appendLog('CONTENT', `正文解析失败: ${errorMessage(err)}`, 'error')
        }
      }
    } else {
      stepStatus.content = 'failed'
      appendLog('CONTENT', '未获取到正文章节链接，无法解析正文', 'error')
    }

    const failedSteps = Object.entries(stepStatus)
      .filter(([_, status]) => status === 'failed')
      .map(([step]) => step)
    if (failedSteps.length > 0) {
      const stepNames: Record<string, string> = {
        search: currentDebugMode.value === 'explore' ? '发现' : '搜索',
        bookInfo: '详情',
        toc: '目录',
        content: '正文',
      }
      const failedNames = failedSteps.map(s => stepNames[s] || s).join('、')
      appendLog('DONE', `书源调试结束，部分流程未通过（${failedNames}），请参考上方日志进行调整。`, 'warn')
      ElMessage.warning(`书源调试未全部通过（${failedNames}）`)
    } else {
      appendLog('DONE', '书源全流程调试完成!', 'success')
      ElMessage.success('调试完成')
    }
  } catch (err: unknown) {
    appendLog('FATAL', `调试中止: ${errorMessage(err)}`, 'error')
  } finally {
    isDebugging.value = false
  }
}

function handleErrorChallenge(err: unknown, targetSource: BookSource) {
  if (err instanceof SecurityChallengeError) {
    appendLog('CHALLENGE', `【诊断结果】源站要求浏览器完成安全访问验证（${err.diagnostics.title || err.diagnostics.type}）。`, 'warn')
    if (err.diagnostics.cfRay) {
      appendLog('CHALLENGE', `cf-ray: ${err.diagnostics.cfRay}`, 'warn')
    }
    if (err.diagnostics.cfMitigated) {
      appendLog('CHALLENGE', `cf-mitigated: ${err.diagnostics.cfMitigated}`, 'warn')
    }
    if (err.diagnostics.snippet) {
      appendLog('RAW_PAGE', `拦截页面片段摘要:\n${err.diagnostics.snippet}`, 'info')
    }
    if (!targetSource.useWebView) {
      appendLog('SUGGEST', '建议：请在「书源编辑」中启用「WebView 通道」，或在「网页验证」中完成浏览器安全验证。', 'warn')
    }
  } else if (errorMessage(err).includes('404') || errorMessage(err).includes('403') || errorMessage(err).includes('500')) {
    appendLog('DIAGNOSE', '【诊断结果】源站服务返回异常状态码，此书源的接口可能已失效或被目标站拦截。', 'warn')
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
  flex-wrap: wrap;
}

.input-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.debug-dialog-input {
  width: 320px;
}

.help-btn {
  color: var(--el-text-color-secondary);
  font-size: 16px;
  padding: 4px;
}

.help-btn:hover {
  color: var(--el-color-primary);
}

.explore-dropdown-menu {
  max-height: 280px;
  overflow-y: auto;
}

.explore-item-title {
  font-weight: 600;
  margin-right: 8px;
}

.explore-item-url {
  font-size: 11px;
  color: var(--el-text-color-secondary);
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

.step-card.step-skipped {
  border-color: var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter);
  opacity: 0.65;
}

.step-card.step-skipped .step-num {
  background: var(--el-text-color-placeholder);
  color: #fff;
}

.step-card.step-skipped .step-status {
  color: var(--el-text-color-placeholder);
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
  font-family: var(--legado-font-code);
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

.log-success .log-tag {
  color: #67c23a;
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
</style>
