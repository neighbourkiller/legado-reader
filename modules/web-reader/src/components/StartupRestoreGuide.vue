<template>
  <el-alert
    title="从现有备份恢复阅读数据"
    type="info"
    :closable="false"
    show-icon
    class="startup-restore-guide"
  >
    <template #default>
      <p>检测到书架为空。可导入 Legado Android、Web 或 Tauri 客户端导出的 ZIP 备份；首次引导固定使用合并恢复，不会覆盖备份未涉及的数据。</p>
      <el-button type="primary" :icon="Download" :loading="isRestoring" @click="restoreFromFile">
        从现有备份恢复
      </el-button>
    </template>
  </el-alert>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { parseBackupArchive, restoreParsedBackup } from '@/backup/archive'
import { STARTUP_RESTORE_MODE } from '@/backup/startupRestore'
import { chooseBackupFile } from '@/platform/backupFiles'

const emit = defineEmits<{ restored: [] }>()
const isRestoring = ref(false)

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function restoreFromFile(): Promise<void> {
  if (isRestoring.value) return
  isRestoring.value = true
  try {
    const selected = await chooseBackupFile()
    if (!selected) return

    const parsed = await parseBackupArchive(selected.bytes)
    const report = await restoreParsedBackup(parsed, STARTUP_RESTORE_MODE)
    const skipped = report.skippedLocalAndroidBooks
      ? `，跳过 ${report.skippedLocalAndroidBooks} 本无可移植正文的 Android 本地书`
      : ''
    ElMessage.success(`恢复完成：${report.restored.onlineBooks} 本网络书${skipped}`)
    emit('restored')
  } catch (error) {
    ElMessage.error(`恢复失败，原有数据未被修改：${errorMessage(error)}`)
  } finally {
    isRestoring.value = false
  }
}
</script>

<style scoped>
.startup-restore-guide {
  width: min(100%, 620px);
  margin-bottom: 22px;
}

.startup-restore-guide p {
  margin: 0 0 12px;
  line-height: 1.65;
}
</style>
