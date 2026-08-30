<template>
  <el-dialog
    :model-value="visible"
    title="编辑书源"
    width="720px"
    center
    align-center
    destroy-on-close
    class="source-edit-dialog"
    @update:model-value="onDialogVisibleChange"
  >
    <div class="edit-dialog-body" v-if="formData">
      <el-tabs v-model="activeTab" class="edit-tabs" @tab-change="handleTabChange">
        <!-- 表单可视化编辑 -->
        <el-tab-pane label="表单配置" name="form">
          <el-form label-position="top" size="default" class="source-form">
            <div class="form-section-title">基本信息</div>
            <div class="form-grid-2">
              <el-form-item label="书源名称" required>
                <el-input v-model="formData.bookSourceName" placeholder="例如：顶点小说" />
              </el-form-item>
              <el-form-item label="书源分组">
                <el-input v-model="formData.bookSourceGroup" placeholder="例如：通用, 精选" />
              </el-form-item>
            </div>

            <div class="form-grid-2">
              <el-form-item label="书源基础 URL" required>
                <el-input v-model="formData.bookSourceUrl" placeholder="https://www.example.com" />
              </el-form-item>
              <el-form-item label="是否启用">
                <el-switch v-model="formData.enabled" active-text="启用" inactive-text="禁用" />
              </el-form-item>
            </div>

            <div class="form-section-title">搜索规则 (Search)</div>
            <el-form-item label="搜索 URL (使用 {{key}} 代替搜索词)">
              <el-input v-model="formData.searchUrl" placeholder="例如：https://example.com/search?keyword={{key}}" />
            </el-form-item>

            <div class="form-grid-2">
              <el-form-item label="书籍列表 (bookList)">
                <el-input v-model="formData.ruleSearch.bookList" placeholder="CSS/XPath/JSONPath，如 .book-item" />
              </el-form-item>
              <el-form-item label="书名规则 (name)">
                <el-input v-model="formData.ruleSearch.name" placeholder="如 .title@text 或 $.name" />
              </el-form-item>
            </div>

            <div class="form-grid-2">
              <el-form-item label="作者规则 (author)">
                <el-input v-model="formData.ruleSearch.author" placeholder="如 .author@text" />
              </el-form-item>
              <el-form-item label="详情链接规则 (bookUrl)">
                <el-input v-model="formData.ruleSearch.bookUrl" placeholder="如 a.title@href" />
              </el-form-item>
            </div>

            <div class="form-grid-2">
              <el-form-item label="封面规则 (coverUrl)">
                <el-input v-model="formData.ruleSearch.coverUrl" placeholder="如 img@src" />
              </el-form-item>
              <el-form-item label="最新章节 (lastChapter)">
                <el-input v-model="formData.ruleSearch.lastChapter" placeholder="如 .last-chapter@text" />
              </el-form-item>
            </div>

            <el-form-item label="简介规则 (intro)">
              <el-input v-model="formData.ruleSearch.intro" placeholder="如 .intro@text" />
            </el-form-item>

            <el-collapse class="advanced-rules-collapse">
              <el-collapse-item title="更多高级规则（详情、目录与正文）" name="advanced">
                <div class="sub-section-title">详情页规则 (BookInfo)</div>
                <div class="form-grid-2">
                  <el-form-item label="详情书名">
                    <el-input v-model="formData.ruleBookInfo.name" placeholder="如 h1.name@text" />
                  </el-form-item>
                  <el-form-item label="目录链接 (tocUrl)">
                    <el-input v-model="formData.ruleBookInfo.tocUrl" placeholder="如 a.toc-link@href" />
                  </el-form-item>
                </div>

                <div class="sub-section-title">目录页规则 (Toc)</div>
                <div class="form-grid-2">
                  <el-form-item label="章节列表 (chapterList)">
                    <el-input v-model="formData.ruleToc.chapterList" placeholder="如 .chapter-list li a" />
                  </el-form-item>
                  <el-form-item label="章节名称 (chapterName)">
                    <el-input v-model="formData.ruleToc.chapterName" placeholder="如 text" />
                  </el-form-item>
                </div>
                <el-form-item label="章节链接 (chapterUrl)">
                  <el-input v-model="formData.ruleToc.chapterUrl" placeholder="如 href" />
                </el-form-item>

                <div class="sub-section-title">正文页规则 (Content)</div>
                <div class="form-grid-2">
                  <el-form-item label="正文内容 (content)">
                    <el-input v-model="formData.ruleContent.content" placeholder="如 #content@text" />
                  </el-form-item>
                  <el-form-item label="下一页链接 (nextContentUrl)">
                    <el-input v-model="formData.ruleContent.nextContentUrl" placeholder="如 a.next-page@href" />
                  </el-form-item>
                </div>
                <el-form-item label="正文替换 (replaceRegex)">
                  <el-input
                    v-model="formData.ruleContent.replaceRegex"
                    placeholder="如 ##广告内容## 或 ##匹配式##替换内容"
                  />
                </el-form-item>
              </el-collapse-item>
            </el-collapse>
          </el-form>
        </el-tab-pane>

        <!-- 原始 JSON 代码编辑 -->
        <el-tab-pane label="JSON 源码" name="json">
          <div class="json-editor-pane">
            <div class="json-actions">
              <span class="json-tip">可以直接编辑或粘贴书源的标准 Legado JSON 对象：</span>
              <el-button size="small" @click="formatJson">格式化 JSON</el-button>
            </div>
            <el-input
              v-model="jsonText"
              type="textarea"
              :rows="18"
              placeholder="在此编辑书源 JSON..."
              class="json-textarea"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="emit('update:visible', false)">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { BookSource } from '@/source/types/BookSource'

const props = defineProps<{
  visible: boolean
  source: BookSource | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
  (e: 'save', source: BookSource): void
}>()

const activeTab = ref<'form' | 'json'>('form')
const formData = ref<any>(null)
const jsonText = ref('')

function onDialogVisibleChange(val: boolean) {
  emit('update:visible', val)
}

function cloneSource(src: BookSource | null) {
  if (!src) return null
  const cloned = JSON.parse(JSON.stringify(src))
  if (!cloned.ruleSearch) cloned.ruleSearch = {}
  if (!cloned.ruleBookInfo) cloned.ruleBookInfo = {}
  if (!cloned.ruleToc) cloned.ruleToc = {}
  if (!cloned.ruleContent) cloned.ruleContent = {}
  return cloned
}

watch(
  () => props.source,
  newSource => {
    if (newSource) {
      formData.value = cloneSource(newSource)
      jsonText.value = JSON.stringify(newSource, null, 2)
      activeTab.value = 'form'
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
  emit('update:visible', false)
}
</script>

<style scoped>
.source-edit-dialog :deep(.el-dialog__body) {
  padding-top: 10px;
  max-height: 68vh;
  overflow-y: auto;
}

.edit-tabs {
  margin-top: -10px;
}

.form-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 12px 0 10px 0;
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
  gap: 12px;
}

.advanced-rules-collapse {
  margin-top: 16px;
  border-radius: 6px;
  overflow: hidden;
}

.json-editor-pane {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
  font-family: var(--legado-font-code);
  font-size: 12px;
  line-height: 1.5;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

@media screen and (max-width: 600px) {
  .form-grid-2 {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
