<template>
  <div class="backup-panel">
    <el-alert
      v-if="!isDesktop"
      title="仅桌面客户端支持备份与恢复"
      description="请在 Tauri 桌面客户端中使用本地 ZIP 和 WebDAV 备份。"
      type="info"
      :closable="false"
      show-icon
    />

    <template v-else>
      <el-card shadow="never" class="backup-card">
        <template #header>
          <div class="card-title">
            <strong>本地备份</strong>
            <small>生成可由 Legado 安卓端识别的 ZIP，并保留桌面端完整数据</small>
          </div>
        </template>

        <div class="action-row">
          <el-button type="primary" :loading="busy === 'local-backup'" @click="backupToLocal">
            备份到本地
          </el-button>
          <el-button :loading="busy === 'local-restore'" @click="restoreFromFile">
            从文件恢复
          </el-button>
        </div>
        <p class="content-note">
          包含书源、网络书架、书签、阅读记录，以及桌面端本地 TXT/EPUB、章节缓存和桌面设置。
          WebDAV 密码、设备 ID、Cookie 与临时任务不会进入备份。
        </p>
      </el-card>

      <el-card shadow="never" class="backup-card">
        <template #header>
          <div class="card-title">
            <strong>WebDAV</strong>
            <small>手动上传、刷新列表或恢复；默认与安卓端共用 legado/ 目录</small>
          </div>
        </template>

        <el-form label-width="100px" class="webdav-form">
          <el-form-item label="服务器">
            <el-input v-model="webdav.serverUrl" placeholder="https://dav.jianguoyun.com/dav/" />
          </el-form-item>
          <el-form-item label="账号">
            <el-input v-model="webdav.account" autocomplete="username" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input
              v-model="password"
              type="password"
              show-password
              autocomplete="current-password"
              :placeholder="webdav.passwordSaved ? '已安全保存在系统凭据库；留空不修改' : '保存在系统凭据库'"
            />
          </el-form-item>
          <el-form-item label="子目录">
            <el-input v-model="webdav.directory" placeholder="legado/" />
          </el-form-item>
          <el-form-item label="设备名">
            <el-input v-model="webdav.deviceName" placeholder="用于备份文件名，可留空" />
          </el-form-item>
          <el-form-item>
            <div class="action-row wrap">
              <el-button :loading="busy === 'save-config'" @click="saveConfig">保存配置</el-button>
              <el-button :loading="busy === 'test'" @click="testConnection">测试连接</el-button>
              <el-button type="primary" :loading="busy === 'upload'" @click="uploadNow">
                立即上传
              </el-button>
              <el-button :loading="busy === 'list'" @click="refreshCloudList">刷新列表</el-button>
            </div>
          </el-form-item>
        </el-form>

        <el-table v-if="cloudFiles.length" :data="cloudFiles" size="small" class="cloud-table">
          <el-table-column prop="name" label="备份文件" min-width="260" />
          <el-table-column label="大小" width="110">
            <template #default="scope">{{ formatBytes(scope.row.size) }}</template>
          </el-table-column>
          <el-table-column label="修改时间" width="190">
            <template #default="scope">{{ formatTime(scope.row.modifiedAt, scope.row.modified) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="scope">
              <el-button
                link
                type="primary"
                :loading="busy === `cloud:${scope.row.name}`"
                @click="restoreFromCloud(scope.row.name)"
              >恢复</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else description="尚未加载云端备份" :image-size="60" />
      </el-card>

      <el-alert
        v-if="statusText"
        :title="statusText"
        :type="statusType"
        :closable="false"
        show-icon
      />
    </template>

    <el-dialog v-model="restoreDialogVisible" title="确认恢复备份" width="600px" :close-on-click-modal="false">
      <template v-if="pendingBackup">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="备份类型">{{ backupKindLabel }}</el-descriptions-item>
          <el-descriptions-item label="备份时间">{{ previewCreatedAt }}</el-descriptions-item>
          <el-descriptions-item label="书源">{{ pendingBackup.preview.counts.bookSources }}</el-descriptions-item>
          <el-descriptions-item label="网络书籍">{{ pendingBackup.preview.counts.onlineBooks }}</el-descriptions-item>
          <el-descriptions-item label="本地书籍">{{ pendingBackup.preview.counts.localBooks }}</el-descriptions-item>
          <el-descriptions-item label="书签">{{ pendingBackup.preview.counts.bookmarks }}</el-descriptions-item>
          <el-descriptions-item label="阅读记录">{{ pendingBackup.preview.counts.readingRecords }}</el-descriptions-item>
          <el-descriptions-item label="章节缓存">{{ pendingBackup.preview.counts.chapterContents }}</el-descriptions-item>
          <el-descriptions-item label="标注">{{ pendingBackup.preview.counts.highlights }}</el-descriptions-item>
          <el-descriptions-item label="替换规则">{{ pendingBackup.preview.counts.replaceRules }}</el-descriptions-item>
        </el-descriptions>

        <el-alert
          v-for="warning in pendingBackup.preview.warnings"
          :key="warning"
          class="preview-warning"
          :title="warning"
          type="warning"
          :closable="false"
          show-icon
        />

        <el-radio-group v-model="restoreMode" class="restore-modes">
          <el-radio value="merge">
            <span class="mode-copy"><strong>合并更新</strong><small>更新相同书源、书籍和记录，保留备份未涉及的数据</small></span>
          </el-radio>
          <el-radio value="overwrite">
            <span class="mode-copy"><strong>覆盖恢复</strong><small>{{ overwriteDescription }}</small></span>
          </el-radio>
        </el-radio-group>
      </template>

      <template #footer>
        <el-button @click="restoreDialogVisible = false">取消</el-button>
        <el-button type="danger" :loading="busy === 'restore'" @click="confirmRestore">
          确认恢复
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createBackupArchive, makeBackupFilename, parseBackupArchive, restoreParsedBackup } from '@/backup/archive'
import type { ParsedBackup, RestoreMode } from '@/backup/types'
import { getAppVersion } from '@/platform/appInfo'
import { platform } from '@/platform/capabilities'
import { chooseBackupFile, saveBackupFile } from '@/platform/backupFiles'
import {
  downloadWebDavBackup,
  getWebDavConfig,
  listWebDavBackups,
  saveWebDavConfig,
  testWebDavConnection,
  uploadWebDavBackup,
  type WebDavBackupFile,
  type WebDavConfig,
} from '@/platform/webdav'

const isDesktop = platform.isDesktop
const busy = ref('')
const statusText = ref('')
const statusType = ref<'success' | 'warning' | 'error' | 'info'>('info')
const password = ref('')
const cloudFiles = ref<WebDavBackupFile[]>([])
const pendingBackup = ref<ParsedBackup | null>(null)
const restoreDialogVisible = ref(false)
const restoreMode = ref<RestoreMode>('merge')
const webdav = reactive<WebDavConfig>({
  serverUrl: 'https://dav.jianguoyun.com/dav/',
  account: '',
  directory: 'legado/',
  deviceName: 'Tauri',
  passwordSaved: false,
})

const backupKindLabel = computed(() => {
  if (pendingBackup.value?.preview.kind === 'tauri') return 'Tauri 混合备份'
  if (pendingBackup.value?.preview.kind === 'newer-tauri') return '较新版本 Tauri 备份（仅共同数据）'
  return '安卓备份'
})
const previewCreatedAt = computed(() => {
  const value = pendingBackup.value?.preview.createdAt
  return value ? new Date(value).toLocaleString() : '备份未记录'
})
const overwriteDescription = computed(() => pendingBackup.value?.preview.canRestoreTauriData
  ? '完整还原该 Tauri 快照，删除当前快照中多出的数据'
  : '替换安卓共同数据，保留桌面本地书籍、文件和专属设置')

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function setStatus(text: string, type: typeof statusType.value): void {
  statusText.value = text
  statusType.value = type
}

async function createDesktopArchive() {
  return createBackupArchive(await getAppVersion())
}

async function runBusy<T>(name: string, task: () => Promise<T>): Promise<T> {
  if (busy.value) throw new Error('另一个备份任务正在执行')
  busy.value = name
  try {
    return await task()
  } finally {
    busy.value = ''
  }
}

async function loadConfig(): Promise<void> {
  if (!isDesktop) return
  try {
    Object.assign(webdav, await getWebDavConfig())
  } catch (error) {
    setStatus(errorMessage(error), 'warning')
  }
}

async function backupToLocal(): Promise<void> {
  try {
    await runBusy('local-backup', async () => {
      setStatus('正在生成一致性快照和校验值…', 'info')
      const result = await createDesktopArchive()
      const path = await saveBackupFile(result.bytes, makeBackupFilename(webdav.deviceName))
      if (!path) {
        setStatus('已取消保存', 'info')
        return
      }
      const fallback = result.positionFallbacks
        ? `；${result.positionFallbacks} 本进度因缺少章节缓存，在安卓端降级到章首`
        : ''
      setStatus(`备份已保存：${path}${fallback}`, fallback ? 'warning' : 'success')
    })
  } catch (error) {
    setStatus(`备份失败：${errorMessage(error)}`, 'error')
  }
}

function showRestorePreview(parsed: ParsedBackup): void {
  pendingBackup.value = parsed
  restoreMode.value = 'merge'
  restoreDialogVisible.value = true
}

async function restoreFromFile(): Promise<void> {
  try {
    await runBusy('local-restore', async () => {
      const selected = await chooseBackupFile()
      if (!selected) return
      setStatus('正在校验备份内容…', 'info')
      showRestorePreview(await parseBackupArchive(selected.bytes))
    })
  } catch (error) {
    setStatus(`无法打开备份：${errorMessage(error)}`, 'error')
  }
}

async function confirmRestore(): Promise<void> {
  if (!pendingBackup.value) return
  try {
    await runBusy('restore', async () => {
      const report = await restoreParsedBackup(pendingBackup.value!, restoreMode.value)
      restoreDialogVisible.value = false
      const skipped = report.skippedLocalAndroidBooks
        ? `；跳过 ${report.skippedLocalAndroidBooks} 本无法移植正文的安卓本地书`
        : ''
      setStatus(
        `恢复完成：${report.restored.onlineBooks} 本网络书、${report.restored.bookmarks} 个书签、${report.restored.highlights} 条标注、${report.restored.replaceRules} 条替换规则、${report.restored.readingRecords} 条阅读记录${skipped}。应用即将刷新。`,
        report.warnings.length ? 'warning' : 'success',
      )
      ElMessage.success('恢复完成，正在重新加载应用')
      window.setTimeout(() => window.location.reload(), 900)
    })
  } catch (error) {
    setStatus(`恢复失败，原数据已回滚：${errorMessage(error)}`, 'error')
  }
}

async function saveConfig(): Promise<void> {
  try {
    await runBusy('save-config', async () => {
      Object.assign(webdav, await saveWebDavConfig({ ...webdav }, password.value))
      password.value = ''
      setStatus('WebDAV 配置已保存，密码位于系统凭据库', 'success')
    })
  } catch (error) {
    setStatus(`保存配置失败：${errorMessage(error)}`, 'error')
  }
}

async function testConnection(): Promise<void> {
  try {
    await runBusy('test', async () => {
      await testWebDavConnection({ ...webdav }, password.value)
      setStatus('WebDAV 连接成功', 'success')
    })
  } catch (error) {
    setStatus(`WebDAV 连接失败：${errorMessage(error)}`, 'error')
  }
}

async function ensureSavedConfig(): Promise<void> {
  Object.assign(webdav, await saveWebDavConfig({ ...webdav }, password.value))
  password.value = ''
}

async function uploadNow(): Promise<void> {
  try {
    await runBusy('upload', async () => {
      await ensureSavedConfig()
      setStatus('正在生成并上传备份…', 'info')
      const archive = await createDesktopArchive()
      const name = makeBackupFilename(webdav.deviceName)
      await uploadWebDavBackup(name, archive.bytes)
      setStatus(`WebDAV 备份已上传：${name}`, archive.positionFallbacks ? 'warning' : 'success')
      cloudFiles.value = await listWebDavBackups()
    })
  } catch (error) {
    setStatus(`上传失败：${errorMessage(error)}`, 'error')
  }
}

async function refreshCloudList(): Promise<void> {
  try {
    await runBusy('list', async () => {
      cloudFiles.value = await listWebDavBackups()
      setStatus(`已找到 ${cloudFiles.value.length} 个云端备份`, 'success')
    })
  } catch (error) {
    setStatus(`刷新云端列表失败：${errorMessage(error)}`, 'error')
  }
}

async function restoreFromCloud(name: string): Promise<void> {
  try {
    await runBusy(`cloud:${name}`, async () => {
      const confirmed = await ElMessageBox.confirm(`下载并检查云端备份“${name}”？`, '从 WebDAV 恢复', {
        confirmButtonText: '下载',
        cancelButtonText: '取消',
        type: 'warning',
      }).catch(() => false)
      if (!confirmed) return
      setStatus(`正在下载 ${name}…`, 'info')
      const bytes = await downloadWebDavBackup(name)
      showRestorePreview(await parseBackupArchive(bytes))
    })
  } catch (error) {
    setStatus(`下载备份失败：${errorMessage(error)}`, 'error')
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

function formatTime(timestamp: number, fallback: string): string {
  if (timestamp) return new Date(timestamp).toLocaleString()
  const parsed = Date.parse(fallback)
  return Number.isNaN(parsed) ? fallback || '-' : new Date(parsed).toLocaleString()
}

onMounted(loadConfig)
</script>

<style scoped>
.backup-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 920px;
}

.backup-card {
  border-radius: 10px;
}

.card-title {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.card-title small,
.content-note,
.mode-copy small {
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}

.action-row {
  display: flex;
  gap: 10px;
}

.action-row.wrap {
  flex-wrap: wrap;
}

.content-note {
  margin: 14px 0 0;
  font-size: 13px;
}

.webdav-form {
  max-width: 720px;
}

.cloud-table {
  margin-top: 8px;
}

.preview-warning {
  margin-top: 14px;
}

.restore-modes {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
  margin-top: 20px;
}

.restore-modes :deep(.el-radio) {
  height: auto;
  margin-right: 0;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
}

.mode-copy {
  display: inline-flex;
  flex-direction: column;
  gap: 3px;
  white-space: normal;
}
</style>
