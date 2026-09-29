<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { MoreFilled } from '@element-plus/icons-vue'

const props = defineProps<{
  exactSearch: boolean
  groups: string[]
  selectedGroups: string[] | null
}>()
const emit = defineEmits<{
  'toggle-exact': []
  'manage-sources': []
  'select-groups': [groups: string[]]
  'all-sources': []
}>()
const dialogVisible = shallowRef(false)
const draftGroups = ref<string[]>([])

function handleCommand(command: string) {
  if (command === 'exact') emit('toggle-exact')
  else if (command === 'manage') emit('manage-sources')
  else if (command === 'all') emit('all-sources')
  else if (command === 'groups') {
    draftGroups.value = [...(props.selectedGroups ?? props.groups)]
    dialogVisible.value = true
  }
}

function applyGroups() {
  emit('select-groups', [...draftGroups.value])
  dialogVisible.value = false
}
</script>

<template>
  <el-dropdown trigger="click" @command="handleCommand">
    <el-button text size="large" aria-label="搜索选项" title="搜索选项" :icon="MoreFilled" />
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="exact">精准搜索{{ exactSearch ? '（已开启）' : '（已关闭）' }}</el-dropdown-item>
        <el-dropdown-item command="manage">书源管理</el-dropdown-item>
        <el-dropdown-item command="groups">分组选择</el-dropdown-item>
        <el-dropdown-item command="all">全部书源</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
  <el-dialog v-model="dialogVisible" title="分组选择" width="min(480px, 90vw)" append-to-body>
    <p class="group-help">搜索所选分组中已启用的书源；多选时取并集。</p>
    <el-empty v-if="groups.length === 0" description="暂无书源分组，请先添加书源" />
    <el-checkbox-group v-else v-model="draftGroups" class="group-options">
      <el-checkbox v-for="group in groups" :key="group" :value="group">{{ group || '未分组' }}</el-checkbox>
    </el-checkbox-group>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" @click="applyGroups">确定</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.group-help { color: var(--el-text-color-secondary); margin: 0 0 16px; }
.group-options { display: flex; flex-direction: column; max-height: 45vh; overflow-y: auto; }
</style>
