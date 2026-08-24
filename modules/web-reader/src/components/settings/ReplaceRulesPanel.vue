<template>
  <div class="replace-panel">
    <div class="toolbar">
      <el-input v-model="keyword" clearable placeholder="搜索名称、分组或匹配内容" />
      <el-button type="primary" @click="openCreate">新建规则</el-button>
    </div>

    <el-empty v-if="filteredRules.length === 0" description="暂无替换规则" />
    <div v-else class="rule-list">
      <article v-for="(rule, index) in filteredRules" :key="rule.id" class="rule-item">
        <div class="rule-main" @click="openEdit(rule)">
          <strong>{{ rule.name }}</strong>
          <small>{{ rule.group || '未分组' }} · {{ scopeLabel(rule) }}</small>
          <code>{{ rule.pattern }} → {{ rule.replacement || '（空）' }}</code>
        </div>
        <el-switch :model-value="rule.isEnabled" @change="toggleRule(rule, $event)" />
        <el-button text :disabled="index === 0 || Boolean(keyword)" @click="move(rule, -1)">上移</el-button>
        <el-button text :disabled="index === filteredRules.length - 1 || Boolean(keyword)" @click="move(rule, 1)">下移</el-button>
        <el-button type="danger" text @click="remove(rule)">删除</el-button>
      </article>
    </div>

    <ReplaceRuleDialog
      v-model="dialogVisible"
      :rule="editingRule"
      @saved="loadRules"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import ReplaceRuleDialog from '@/components/ReplaceRuleDialog.vue'
import {
  deleteReplaceRule,
  getAllReplaceRules,
  saveReplaceRule,
} from '@/storage/db'
import type { ReplaceRuleRecord } from '@/storage/db'

const rules = ref<ReplaceRuleRecord[]>([])
const keyword = ref('')
const dialogVisible = ref(false)
const editingRule = ref<ReplaceRuleRecord | null>(null)

const filteredRules = computed(() => {
  const value = keyword.value.trim().toLowerCase()
  return value
    ? rules.value.filter(rule => `${rule.name}${rule.group || ''}${rule.pattern}`.toLowerCase().includes(value))
    : rules.value
})

const loadRules = async () => { rules.value = await getAllReplaceRules() }
const openCreate = () => { editingRule.value = null; dialogVisible.value = true }
const openEdit = (rule: ReplaceRuleRecord) => { editingRule.value = rule; dialogVisible.value = true }
const scopeLabel = (rule: ReplaceRuleRecord) => [
  rule.scopeTitle && '标题',
  rule.scopeContent && '正文',
  rule.scopeSource && '书源',
].filter(Boolean).join('、')

const toggleRule = async (rule: ReplaceRuleRecord, value: string | number | boolean) => {
  await saveReplaceRule({ ...rule, isEnabled: Boolean(value) })
  await loadRules()
}

const move = async (rule: ReplaceRuleRecord, delta: -1 | 1) => {
  const index = rules.value.findIndex(item => item.id === rule.id)
  const targetIndex = index + delta
  if (index < 0 || targetIndex < 0 || targetIndex >= rules.value.length) return
  const reordered = [...rules.value]
  const [moved] = reordered.splice(index, 1)
  reordered.splice(targetIndex, 0, moved!)
  await Promise.all(reordered.map((item, order) => saveReplaceRule({ ...item, order: order + 1 })))
  await loadRules()
}

const remove = async (rule: ReplaceRuleRecord) => {
  try {
    await ElMessageBox.confirm(`确定删除替换规则“${rule.name}”吗？`, '删除规则', { type: 'warning' })
    await deleteReplaceRule(rule.id)
    await loadRules()
    ElMessage.success('替换规则已删除')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error('删除替换规则失败')
  }
}

onMounted(() => loadRules().catch(error => {
  console.error('加载替换规则失败', error)
  ElMessage.error('加载替换规则失败')
}))
</script>

<style scoped>
.toolbar { display: flex; gap: 12px; margin-bottom: 18px; }
.rule-list { overflow: hidden; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; }
.rule-item { display: flex; align-items: center; gap: 8px; padding: 12px; border-bottom: 1px solid var(--el-border-color-lighter); }
.rule-item:last-child { border-bottom: 0; }
.rule-main { display: flex; flex: 1; min-width: 0; cursor: pointer; flex-direction: column; gap: 4px; }
.rule-main small { color: var(--el-text-color-secondary); }
.rule-main code { overflow: hidden; color: var(--el-text-color-regular); text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 720px) { .rule-item { flex-wrap: wrap; } .rule-main { flex-basis: 100%; } }
</style>
