<template>
  <div class="source-edit-panel" v-if="formData">
    <div class="panel-header">
      <div class="panel-header-left">
        <el-tabs v-model="activeTab" class="edit-tabs" @tab-change="handleTabChange">
          <el-tab-pane label="表单配置" name="form" />
          <el-tab-pane label="JSON 源码" name="json" />
        </el-tabs>
      </div>
      <div class="panel-header-actions">
        <el-button @click="handleConvertToCss" class="sharp-btn">
          <el-icon><MagicStick /></el-icon>
          <span>XPath转CSS</span>
        </el-button>
        <el-button @click="handleReset" class="sharp-btn">重置</el-button>
        <el-button type="primary" @click="handleSave" class="sharp-btn">
          <el-icon><Check /></el-icon>
          <span>{{ isNew ? '创建书源' : '保存修改' }}</span>
        </el-button>
      </div>
    </div>

    <div class="panel-body">
      <!-- 表单可视化编辑 -->
      <div v-show="activeTab === 'form'" class="form-pane">
        <el-form label-position="top" size="default" class="source-form">
          <!-- 基本信息 -->
          <div class="form-section">
            <div class="form-section-title">基本信息</div>
            <div class="form-grid-2">
              <el-form-item label="书源名称" required>
                <el-input v-model="formData.bookSourceName" placeholder="例如：顶点小说" class="sharp-input" />
              </el-form-item>
              <el-form-item label="书源分组">
                <el-input v-model="formData.bookSourceGroup" placeholder="例如：通用, 精选" class="sharp-input" />
              </el-form-item>
            </div>

            <div class="form-grid-2">
              <el-form-item label="书源基础 URL" required>
                <el-input v-model="formData.bookSourceUrl" placeholder="https://www.example.com" class="sharp-input" />
              </el-form-item>
              <el-form-item label="是否启用">
                <el-switch v-model="formData.enabled" active-text="启用" inactive-text="禁用" />
              </el-form-item>
            </div>
          </div>

          <!-- 搜索规则 -->
          <div class="form-section">
            <div class="form-section-title">搜索规则 (Search)</div>
            <el-form-item label="搜索 URL (使用 {{key}} 代替搜索词)">
              <el-input v-model="formData.searchUrl" placeholder="例如：https://example.com/search?keyword={{key}}" class="sharp-input" />
            </el-form-item>

            <div class="form-grid-2">
              <el-form-item label="书籍列表 (bookList)">
                <el-input v-model="formData.ruleSearch.bookList" placeholder="CSS/XPath/JSONPath，如 .book-item" class="sharp-input" />
              </el-form-item>
              <el-form-item label="书名规则 (name)">
                <el-input v-model="formData.ruleSearch.name" placeholder="如 .title@text 或 $.name" class="sharp-input" />
              </el-form-item>
            </div>

            <div class="form-grid-2">
              <el-form-item label="作者规则 (author)">
                <el-input v-model="formData.ruleSearch.author" placeholder="如 .author@text" class="sharp-input" />
              </el-form-item>
              <el-form-item label="详情链接规则 (bookUrl)">
                <el-input v-model="formData.ruleSearch.bookUrl" placeholder="如 a.title@href" class="sharp-input" />
              </el-form-item>
            </div>

            <div class="form-grid-2">
              <el-form-item label="封面规则 (coverUrl)">
                <el-input v-model="formData.ruleSearch.coverUrl" placeholder="如 img@src" class="sharp-input" />
              </el-form-item>
              <el-form-item label="最新章节 (lastChapter)">
                <el-input v-model="formData.ruleSearch.lastChapter" placeholder="如 .last-chapter@text" class="sharp-input" />
              </el-form-item>
            </div>

            <el-form-item label="简介规则 (intro)">
              <el-input v-model="formData.ruleSearch.intro" placeholder="如 .intro@text" class="sharp-input" />
            </el-form-item>
          </div>

          <!-- 高级规则 -->
          <div class="form-section">
            <el-collapse class="advanced-rules-collapse sharp-collapse">
              <el-collapse-item title="更多高级规则（详情、目录与正文）" name="advanced">
                <div class="sub-section-title">详情页规则 (BookInfo)</div>
                <div class="form-grid-2">
                  <el-form-item label="详情书名">
                    <el-input v-model="formData.ruleBookInfo.name" placeholder="如 h1.name@text" class="sharp-input" />
                  </el-form-item>
                  <el-form-item label="目录链接 (tocUrl)">
                    <el-input v-model="formData.ruleBookInfo.tocUrl" placeholder="如 a.toc-link@href" class="sharp-input" />
                  </el-form-item>
                </div>

                <div class="sub-section-title">目录页规则 (Toc)</div>
                <div class="form-grid-2">
                  <el-form-item label="章节列表 (chapterList)">
                    <el-input v-model="formData.ruleToc.chapterList" placeholder="如 .chapter-list li a" class="sharp-input" />
                  </el-form-item>
                  <el-form-item label="章节名称 (chapterName)">
                    <el-input v-model="formData.ruleToc.chapterName" placeholder="如 text" class="sharp-input" />
                  </el-form-item>
                </div>
                <el-form-item label="章节链接 (chapterUrl)">
                  <el-input v-model="formData.ruleToc.chapterUrl" placeholder="如 href" class="sharp-input" />
                </el-form-item>

                <div class="sub-section-title">正文页规则 (Content)</div>
                <div class="form-grid-2">
                  <el-form-item label="正文内容 (content)">
                    <el-input v-model="formData.ruleContent.content" placeholder="如 #content@text" class="sharp-input" />
                  </el-form-item>
                  <el-form-item label="下一页链接 (nextContentUrl)">
                    <el-input v-model="formData.ruleContent.nextContentUrl" placeholder="如 a.next-page@href" class="sharp-input" />
                  </el-form-item>
                </div>
                <el-form-item label="正文替换 (replaceRegex)">
                  <el-input
                    v-model="formData.ruleContent.replaceRegex"
                    placeholder="如 ##广告内容## 或 ##匹配式##替换内容"
                    class="sharp-input"
                  />
                </el-form-item>
              </el-collapse-item>
            </el-collapse>
          </div>
        </el-form>
      </div>

      <!-- 原始 JSON 代码编辑 -->
      <div v-show="activeTab === 'json'" class="json-pane">
        <div class="json-actions">
          <span class="json-tip">可以直接编辑或粘贴书源的标准 Legado JSON 对象：</span>
          <el-button size="small" @click="formatJson" class="sharp-btn">格式化 JSON</el-button>
        </div>
        <el-input
          v-model="jsonText"
          type="textarea"
          :rows="20"
          placeholder="在此编辑书源 JSON..."
          class="json-textarea sharp-textarea"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { Check, MagicStick } from '@element-plus/icons-vue'
import type { BookSource } from '@/source/types/BookSource'
import { convertBookSourceXPath } from '@/source/engine/XPathConverter'

const props = withDefaults(
  defineProps<{
    source: BookSource | null
    isNew?: boolean
  }>(),
  {
    isNew: false,
  }
)

const emit = defineEmits<{
  (e: 'save', source: BookSource): void
}>()

export type EditableBookSource = BookSource & {
  ruleSearch: NonNullable<BookSource['ruleSearch']>
  ruleBookInfo: NonNullable<BookSource['ruleBookInfo']>
  ruleToc: NonNullable<BookSource['ruleToc']>
  ruleContent: NonNullable<BookSource['ruleContent']>
}

const activeTab = ref<'form' | 'json'>('form')
const formData = ref<EditableBookSource | null>(null)
const jsonText = ref('')

function cloneSource(src: BookSource | null): EditableBookSource | null {
  if (!src) return null
  const cloned = JSON.parse(JSON.stringify(src))
  if (!cloned.ruleSearch) cloned.ruleSearch = {}
  if (!cloned.ruleBookInfo) cloned.ruleBookInfo = {}
  if (!cloned.ruleToc) cloned.ruleToc = {}
  if (!cloned.ruleContent) cloned.ruleContent = {}
  return cloned as EditableBookSource
}

watch(
  () => props.source,
  newSource => {
    if (newSource) {
      formData.value = cloneSource(newSource)
      jsonText.value = JSON.stringify(newSource, null, 2)
    }
  },
  { immediate: true }
)

const handleTabChange = (tabName: string | number) => {
  if (tabName === 'json') {
    jsonText.value = JSON.stringify(formData.value, null, 2)
  } else if (tabName === 'form') {
    try {
      const parsed = JSON.parse(jsonText.value)
      formData.value = cloneSource(parsed)
    } catch {
      ElMessage.warning('当前 JSON 格式有误，未应用到表单')
    }
  }
}

const handleReset = () => {
  if (props.source) {
    formData.value = cloneSource(props.source)
    jsonText.value = JSON.stringify(props.source, null, 2)
    ElMessage.info('已恢复至当前书源初始内容')
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const handleConvertToCss = async () => {
  if (activeTab.value === 'json') {
    try {
      formData.value = cloneSource(JSON.parse(jsonText.value))
    } catch {
      ElMessage.error('当前 JSON 格式有误，请先修正后再执行转换')
      return
    }
  }

  if (!formData.value) return

  try {
    await ElMessageBox.confirm(
      '确定要将当前书源中的 XPath 规则批量转换为 CSS 选择器吗？\n复杂或无法等价转换的规则将自动保留原样。未保存前可点击“重置”按钮恢复初始状态。',
      'XPath 转 CSS 规则优化',
      {
        confirmButtonText: '确认转换',
        cancelButtonText: '取消',
        type: 'info',
      }
    )
  } catch {
    return
  }

  const summary = convertBookSourceXPath(formData.value)

  if (summary.convertedCount === 0 && summary.skippedCount === 0) {
    ElMessage.info('未在当前书源中检测到 XPath 规则')
    return
  }

  if (summary.convertedCount === 0 && summary.skippedCount > 0) {
    ElMessage.warning(`检测到 ${summary.skippedCount} 处 XPath 规则，但均包含不支持的复杂语法，已保持原样`)
    return
  }

  formData.value = cloneSource(summary.source)
  jsonText.value = JSON.stringify(summary.source, null, 2)

  const detailItems = summary.details.map(
    d => `<li><b>${escapeHtml(d.field)}</b>: <code>${escapeHtml(d.from)}</code> &rarr; <code style="color: #67c23a;">${escapeHtml(d.to)}</code></li>`
  ).join('')

  const skippedItems = summary.skipped.map(
    s => `<li><b>${escapeHtml(s.field)}</b>: <code>${escapeHtml(s.rule)}</code> <span style="color: #e6a23c;">(${escapeHtml(s.reason)})</span></li>`
  ).join('')

  let messageHtml = `<div style="font-size: 13px; line-height: 1.6;">
    <p style="margin-bottom: 6px;">成功转换 <b>${summary.convertedCount}</b> 处规则${summary.skippedCount > 0 ? `，跳过 <b>${summary.skippedCount}</b> 处` : ''}：</p>
    <ul style="padding-left: 18px; margin: 4px 0 8px 0; max-height: 160px; overflow-y: auto;">${detailItems}</ul>`

  if (summary.skippedCount > 0) {
    messageHtml += `<p style="margin: 6px 0 4px 0; color: #909399;">跳过的规则（已保留）：</p>
      <ul style="padding-left: 18px; margin: 0; max-height: 100px; overflow-y: auto;">${skippedItems}</ul>`
  }

  messageHtml += `<p style="margin-top: 8px; color: #909399; font-size: 12px;">提示：修改已更新至编辑区，点击“保存修改”以生效，或点击“重置”放弃。</p></div>`

  ElNotification({
    title: 'XPath 转 CSS 完成',
    dangerouslyUseHTMLString: true,
    message: messageHtml,
    type: 'success',
    duration: 8000,
  })
}

const formatJson = () => {
  try {
    const parsed = JSON.parse(jsonText.value)
    jsonText.value = JSON.stringify(parsed, null, 2)
    ElMessage.success('已格式化')
  } catch {
    ElMessage.error('JSON 语法错误，无法格式化')
  }
}

const handleSave = () => {
  let targetSource: BookSource

  if (activeTab.value === 'json') {
    try {
      targetSource = JSON.parse(jsonText.value)
    } catch {
      ElMessage.error('JSON 语法错误，请检查后再保存')
      return
    }
  } else {
    targetSource = JSON.parse(JSON.stringify(formData.value))
  }

  if (!targetSource.bookSourceName?.trim()) {
    ElMessage.warning('请输入书源名称')
    return
  }

  if (!targetSource.bookSourceUrl?.trim()) {
    ElMessage.warning('请输入书源基础 URL')
    return
  }

  emit('save', targetSource)
}

defineExpose({
  getFormData: () => {
    if (activeTab.value === 'json') {
      try {
        return JSON.parse(jsonText.value)
      } catch {
        return formData.value
      }
    }
    return formData.value
  },
})
</script>

<style scoped>
.source-edit-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 12px;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.panel-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}

.form-section {
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 0 !important;
  padding: 16px 20px;
  margin-bottom: 16px;
}

.form-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 14px;
  padding-left: 8px;
  border-left: 3px solid var(--el-color-primary);
}

.sub-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
  margin: 12px 0 8px 0;
}

.form-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.advanced-rules-collapse {
  border: none;
}

.advanced-rules-collapse :deep(.el-collapse-item__header) {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.json-pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.json-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.json-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.json-textarea :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  border-radius: 0 !important;
}

@media screen and (max-width: 900px) {
  .form-grid-2 {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
