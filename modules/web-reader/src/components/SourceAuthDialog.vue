<template>
  <el-dialog
    v-model="visible"
    title="书源网页登录与人机验证 (Cloudflare 盾穿透)"
    width="680px"
    destroy-on-close
    :close-on-click-modal="false"
  >
    <div class="auth-dialog-body" v-if="source">
      <!-- 提示信息栏 -->
      <el-alert
        title="针对 Cloudflare 5秒盾、WAF 防爬或需要登录的书源"
        type="info"
        description="通过桌面内置真实浏览器完成人机验证后，系统自动提取 Cookie 并建立 WebView 请求通道，实现免拦截访问。"
        show-icon
        :closable="false"
        style="margin-bottom: 16px"
      />

      <!-- 书源基础信息 -->
      <div class="source-info-bar">
        <div class="info-row">
          <span class="info-label">书源名称:</span>
          <span class="info-val font-bold">{{ source.bookSourceName }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">目标网址:</span>
          <a :href="source.bookSourceUrl" target="_blank" class="info-link">{{ source.bookSourceUrl }}</a>
        </div>
      </div>

      <!-- 步骤流程 -->
      <div class="step-box">
        <div class="step-title">
          <span class="step-badge">1</span>
          <span>在真实浏览器中通过验证</span>
        </div>
        <div class="step-action">
          <el-button type="primary" size="large" @click="handleOpenBrowser" :loading="isOpeningBrowser">
            <el-icon><Monitor /></el-icon>
            <span>打开内置浏览器窗口</span>
          </el-button>
          <span class="step-tip">点击后将弹出独立网页窗口，请在窗口中等待 5 秒盾通过或完成滑块验证。验证完成后可直接关闭，窗口会转为后台隐藏并保留会话。</span>
        </div>
      </div>

      <div class="step-box">
        <div class="step-title">
          <span class="step-badge">2</span>
          <span>提取凭证与通道配置</span>
        </div>
        <div class="step-form">
          <div class="auto-extract-row">
            <el-button type="success" @click="handleAutoExtract" :loading="isExtracting">
              <el-icon><Download /></el-icon>
              <span>自动提取 Cookie</span>
            </el-button>
            <span class="extract-status" v-if="extractResult">
              <el-tag :type="extractResult.hasCfClearance ? 'success' : 'warning'" size="small">
                {{ extractResult.hasCfClearance ? '✓ 已获取 cf_clearance' : '⚠ 未检测到 cf_clearance' }}
              </el-tag>
              <span class="extract-detail">共 {{ extractResult.cookieCount }} 个 Cookie</span>
            </span>
          </div>

          <el-form label-position="top" size="default" style="margin-top: 12px">
            <el-form-item label="Cookie 凭证 (自动提取或手动填入)">
              <el-input
                v-model="cookieInput"
                type="textarea"
                :rows="2"
                placeholder="点击上方「自动提取」按钮自动填入，或手动粘贴 Cookie"
              />
            </el-form-item>
            <el-form-item label="User-Agent (需与验证时浏览器保持一致)">
              <el-input v-model="uaInput" placeholder="Mozilla/5.0 (Windows NT 10.0; Win64; x64)..." />
            </el-form-item>
            <el-form-item>
              <el-checkbox v-model="useWebViewChannel">
                启用 WebView 请求通道（推荐用于 Cloudflare 保护站点）
              </el-checkbox>
              <div class="channel-tip">
                启用后，搜索/详情/目录/正文请求将通过 WebView 内的 fetch 执行，
                共享验证窗口的 Cookie、UA、TLS 指纹，无需手动同步凭证。
              </div>
            </el-form-item>
          </el-form>
        </div>
      </div>

      <!-- 测试与诊断结果展示 -->
      <div class="test-result-box" v-if="testResult">
        <el-alert
          :title="testResult.success ? '✓ 连通性测试通过！' : '✕ 连通性测试未通过'"
          :type="testResult.success ? 'success' : 'error'"
          :description="testResult.message"
          show-icon
          :closable="false"
        />
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose">关闭</el-button>
        <el-button type="warning" plain @click="handleTestConnection" :loading="isTesting">
          <el-icon><Lightning /></el-icon>
          <span>测试连通性</span>
        </el-button>
        <el-button type="success" @click="handleSaveAndInject" :loading="isSaving">
          <el-icon><Check /></el-icon>
          <span>保存设置</span>
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, toRaw } from 'vue'
import { ElMessage } from 'element-plus'
import { Monitor, Lightning, Check, Download } from '@element-plus/icons-vue'
import type { BookSource } from '@/source/types/BookSource'
import { useBookSourceStore } from '@/stores/bookSource'
import { getTransport } from '@/source/transport'
import { TauriTransport } from '@/source/transport/TauriTransport'
import { SourceEngine, getDefaultUserAgent } from '@/source/engine/SourceEngine'

const props = defineProps<{
  modelValue: boolean
  source?: BookSource | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'saved', source: BookSource): void
}>()

const bookSourceStore = useBookSourceStore()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const cookieInput = ref('')
const uaInput = ref(getDefaultUserAgent())
const useWebViewChannel = ref(false)
const isOpeningBrowser = ref(false)
const isSaving = ref(false)
const isTesting = ref(false)
const isExtracting = ref(false)
const extractResult = ref<{ cookieCount: number; cookieNames: string[]; hasCfClearance: boolean } | null>(null)
const testResult = ref<{ success: boolean; message: string } | null>(null)

watch(
  () => props.source,
  (newSource) => {
    if (newSource) {
      testResult.value = null
      extractResult.value = null
      uaInput.value = getDefaultUserAgent()
      useWebViewChannel.value = newSource.useWebView ?? false
      // 从现有 header 中提取已有的 Cookie 与 UA
      if (newSource.header) {
        try {
          const headerObj =
            typeof newSource.header === 'string' ? JSON.parse(newSource.header) : newSource.header
          if (headerObj.Cookie || headerObj.cookie) {
            cookieInput.value = headerObj.Cookie || headerObj.cookie
          }
          if (headerObj['User-Agent'] || headerObj['user-agent']) {
            uaInput.value = headerObj['User-Agent'] || headerObj['user-agent']
          }
        } catch {
          // Ignore
        }
      }
    }
  },
  { immediate: true }
)

const handleOpenBrowser = async () => {
  if (!props.source?.bookSourceUrl) return
  isOpeningBrowser.value = true

  try {
    const transport = await getTransport()
    if (transport instanceof TauriTransport) {
      const loginUrl = new URL(props.source.loginUrl || props.source.bookSourceUrl, props.source.bookSourceUrl).href
      await transport.openAuthWindow(
        props.source.bookSourceUrl,
        loginUrl,
        `书源人机验证 - ${props.source.bookSourceName}`
      )
      ElMessage.success('已打开内置验证窗口，请在窗口中完成验证！')
    } else {
      window.open(props.source.bookSourceUrl, '_blank')
      ElMessage.info('已在新窗口中打开目标网页，请完成验证后复制 Cookie')
    }
  } catch (err: any) {
    ElMessage.error(`打开验证窗口失败: ${err.message || err}`)
  } finally {
    isOpeningBrowser.value = false
  }
}

/** 自动从 WebView 验证窗口提取 Cookie（使用 Tauri cookies_for_url API） */
const handleAutoExtract = async () => {
  if (!props.source?.bookSourceUrl) return
  isExtracting.value = true
  extractResult.value = null

  try {
    const transport = await getTransport()
    if (transport instanceof TauriTransport && transport.syncWebviewCookies) {
      const result = await transport.syncWebviewCookies(
        props.source.bookSourceUrl,
        props.source.bookSourceUrl,
      )
      extractResult.value = result

      if (result.cookieCount > 0) {
        // 同时读取注入后的 cookie 字符串用于显示
        if (transport.getCookies) {
          const cookieStr = await transport.getCookies(
            props.source.bookSourceUrl,
            props.source.bookSourceUrl,
          )
          if (cookieStr) {
            cookieInput.value = cookieStr
          }
        }
        if (result.hasCfClearance && transport.closeAuthWindow) {
          await transport.closeAuthWindow(props.source.bookSourceUrl)
        }
        ElMessage.success(`成功提取 ${result.cookieCount} 个 Cookie${result.hasCfClearance ? '（含 cf_clearance）' : ''}`)
        if (props.source.loginCheckJs?.trim()) {
          const login = await new SourceEngine().checkLogin(props.source)
          testResult.value = {
            success: login.loggedIn,
            message: login.loggedIn ? 'Cookie 已同步，loginCheckJs 验证登录成功' : 'Cookie 已同步，但 loginCheckJs 判断尚未登录',
          }
        }
      } else {
        ElMessage.warning('未提取到任何 Cookie，请确保已在浏览器窗口中完成验证')
      }
    } else {
      ElMessage.warning('自动提取仅支持桌面端 Tauri 环境')
    }
  } catch (err: any) {
    ElMessage.error(`提取 Cookie 失败: ${err.message || err}`)
  } finally {
    isExtracting.value = false
  }
}

const handleSaveAndInject = async () => {
  if (!props.source) return
  isSaving.value = true

  try {
    const targetUrl = props.source.bookSourceUrl
    const cookies = cookieInput.value.trim()
    const ua = uaInput.value.trim()

    // 1. 注入 Rust 后端 CookieJar 与自定义 User-Agent
    const transport = await getTransport()
    if (transport instanceof TauriTransport) {
      if (cookies || ua) {
        await transport.setCookies(props.source.bookSourceUrl, targetUrl, cookies, ua)
      }
    }

    // 2. 更新书源配置（不再将完整 Cookie 明文保存到 header 中）
    let headerObj: Record<string, string> = {}
    if (props.source.header) {
      try {
        headerObj =
          typeof props.source.header === 'string'
            ? JSON.parse(props.source.header)
            : Object.assign({}, props.source.header)
      } catch {}
    }

    // 仅保存 User-Agent 到 header（Cookie 保留在运行时 CookieJar 中）
    if (ua) {
      headerObj['User-Agent'] = ua
    }
    // 清除 header 中的明文 Cookie（安全考虑）
    delete headerObj['Cookie']
    delete headerObj['cookie']

    const rawSource = toRaw(props.source)
    const updatedSource: BookSource = JSON.parse(
      JSON.stringify({
        ...rawSource,
        header: JSON.stringify(headerObj),
        useWebView: useWebViewChannel.value,
      })
    )

    await bookSourceStore.updateSource(updatedSource)
    emit('saved', updatedSource)

    ElMessage.success('书源设置已保存！' + (useWebViewChannel.value ? ' WebView 通道已启用。' : ''))
  } catch (err: any) {
    ElMessage.error(`保存失败: ${err.message || err}`)
  } finally {
    isSaving.value = false
  }
}

const handleTestConnection = async () => {
  if (!props.source) return
  isTesting.value = true
  testResult.value = null

  try {
    const cookies = cookieInput.value.trim()
    const ua = uaInput.value.trim()

    // 1. 注入临时 Cookie 与 UA 到 Rust 后端
    const transport = await getTransport()
    if (transport instanceof TauriTransport && (cookies || ua)) {
      await transport.setCookies(
        props.source.bookSourceUrl,
        props.source.bookSourceUrl,
        cookies,
        ua
      )
    }

    // 2. 构造携带当前设置的临时书源进行测试
    let headerObj: Record<string, string> = {}
    if (props.source.header) {
      try {
        headerObj =
          typeof props.source.header === 'string'
            ? JSON.parse(props.source.header)
            : Object.assign({}, props.source.header)
      } catch {}
    }
    if (cookies) headerObj['Cookie'] = cookies
    if (ua) headerObj['User-Agent'] = ua

    const testSource: BookSource = {
      ...props.source,
      header: JSON.stringify(headerObj),
      useWebView: useWebViewChannel.value,
    }

    const engine = new SourceEngine()
    const searchResults = await engine.search(testSource, '系统')

    const channelLabel = useWebViewChannel.value ? 'WebView 通道' : 'reqwest 通道'
    testResult.value = {
      success: true,
      message: `通过 ${channelLabel} 成功拉取到 ${searchResults.length} 条搜索结果！当前设置有效。`,
    }
    ElMessage.success('测试成功！')
  } catch (err: any) {
    const isCfError = err.name === 'CloudflareChallengeError'
    testResult.value = {
      success: false,
      message: isCfError
        ? `Cloudflare 验证未通过。请确保已在验证窗口完成验证${useWebViewChannel.value ? '' : '，并建议启用 WebView 通道'}。`
            + (err.diagnostics?.cfRay ? ` (cf-ray: ${err.diagnostics.cfRay})` : '')
        : `测试请求异常: ${err.message || err}。请检查凭证或网络连接。`,
    }
    ElMessage.error(isCfError ? 'Cloudflare 验证未通过' : '测试未通过')
  } finally {
    isTesting.value = false
  }
}

const handleClose = () => {
  visible.value = false
}
</script>

<style scoped>
.auth-dialog-body {
  padding: 4px 8px;
}

.source-info-bar {
  background: var(--el-fill-color-light);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.info-label {
  color: var(--el-text-color-secondary);
  width: 70px;
}

.info-val {
  color: var(--el-text-color-primary);
}

.info-link {
  color: var(--el-color-primary);
  text-decoration: none;
  word-break: break-all;
}

.info-link:hover {
  text-decoration: underline;
}

.step-box {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.step-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: bold;
  color: var(--el-text-color-primary);
  margin-bottom: 12px;
}

.step-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background-color: var(--el-color-primary);
  color: white;
  font-size: 12px;
  font-weight: bold;
}

.step-action {
  display: flex;
  align-items: center;
  gap: 16px;
}

.step-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.step-form {
  margin-top: 8px;
}

.auto-extract-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.extract-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.extract-detail {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.channel-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
  margin-top: 4px;
}

.test-result-box {
  margin-top: 12px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
