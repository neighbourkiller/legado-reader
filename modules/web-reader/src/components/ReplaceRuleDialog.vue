<template>
  <el-dialog
    :model-value="modelValue"
    :title="form.id ? '编辑替换规则' : '新建替换规则'"
    width="min(720px, 94vw)"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form label-position="top">
      <div class="two-columns">
        <el-form-item label="替换规则名称">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="分组">
          <el-input v-model="form.group" placeholder="可选" />
        </el-form-item>
      </div>

      <el-form-item label="替换规则">
        <el-input v-model="form.pattern" type="textarea" :rows="3" />
      </el-form-item>
      <el-checkbox v-model="form.isRegex">使用正则表达式</el-checkbox>

      <el-form-item label="替换为" class="replacement-field">
        <el-input v-model="form.replacement" type="textarea" :rows="2" />
      </el-form-item>

      <el-form-item label="作用范围">
        <el-checkbox v-model="form.scopeTitle">作用于标题</el-checkbox>
        <el-checkbox v-model="form.scopeSource">作用于书源</el-checkbox>
        <el-checkbox v-model="form.scopeContent">作用于正文</el-checkbox>
      </el-form-item>
      <el-form-item label="包含范围（书名或书源 URL，留空为全部）">
        <el-input v-model="form.scope" />
      </el-form-item>
      <el-form-item label="排除范围（书名或书源 URL）">
        <el-input v-model="form.excludeScope" />
      </el-form-item>

      <div class="two-columns">
        <el-form-item label="超时毫秒数">
          <el-input-number v-model="form.timeoutMillisecond" :min="100" :max="30000" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.isEnabled" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </div>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getAllReplaceRules, saveReplaceRule } from '@/storage/db'
import type { ReplaceRuleRecord } from '@/storage/db'

const props = defineProps<{
  modelValue: boolean
  rule?: ReplaceRuleRecord | null
  selectionText?: string
  bookName?: string
  sourceUrl?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [rule: ReplaceRuleRecord]
}>()

const saving = ref(false)
const form = reactive<ReplaceRuleRecord>({
  id: 0,
  name: '',
  group: '',
  pattern: '',
  replacement: '',
  scope: '',
  scopeTitle: false,
  scopeSource: false,
  scopeContent: true,
  excludeScope: '',
  isEnabled: true,
  isRegex: false,
  timeoutMillisecond: 3000,
  order: 0,
})

const resetForm = async () => {
  if (props.rule) {
    Object.assign(form, JSON.parse(JSON.stringify(props.rule)))
    return
  }
  const text = (props.selectionText || '').split('\n').map(line => line.trim()).join('\n')
  const rules = await getAllReplaceRules().catch(() => [])
  Object.assign(form, {
    id: 0,
    name: text,
    group: '',
    pattern: text,
    replacement: '',
    scope: [props.bookName, props.sourceUrl].filter(Boolean).join(';'),
    scopeTitle: false,
    scopeSource: false,
    scopeContent: true,
    excludeScope: '',
    isEnabled: true,
    isRegex: false,
    timeoutMillisecond: 3000,
    order: (rules[rules.length - 1]?.order || 0) + 1,
  })
}

watch(
  () => props.modelValue,
  visible => { if (visible) resetForm().catch(console.error) },
)

const save = async () => {
  if (!form.name.trim() || !form.pattern) {
    ElMessage.warning('规则名称和匹配内容不能为空')
    return
  }
  if (!form.scopeTitle && !form.scopeSource && !form.scopeContent) {
    ElMessage.warning('请至少选择一个作用范围')
    return
  }
  if (form.isRegex) {
    try {
      new RegExp(form.pattern)
    } catch (error) {
      ElMessage.error(`正则表达式无效：${error instanceof Error ? error.message : String(error)}`)
      return
    }
  }
  saving.value = true
  try {
    const record: ReplaceRuleRecord = {
      ...JSON.parse(JSON.stringify(form)),
      id: form.id || Date.now(),
      name: form.name.trim(),
      group: form.group?.trim() || '',
      scope: form.scope?.trim() || '',
      excludeScope: form.excludeScope?.trim() || '',
      timeoutMillisecond: Math.max(100, form.timeoutMillisecond || 3000),
    }
    await saveReplaceRule(record)
    ElMessage.success('替换规则已保存')
    emit('saved', record)
    emit('update:modelValue', false)
  } catch (error) {
    console.error('保存替换规则失败', error)
    ElMessage.error('保存替换规则失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.two-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.replacement-field {
  margin-top: 18px;
}

@media (max-width: 640px) {
  .two-columns { grid-template-columns: 1fr; gap: 0; }
}
</style>
