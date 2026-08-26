import { invoke } from '@tauri-apps/api/core'
import { platform } from './capabilities'

export interface WebDavConfig {
  serverUrl: string
  account: string
  directory: string
  deviceName: string
  passwordSaved: boolean
}

export interface WebDavBackupFile {
  name: string
  size: number
  modified: string
  modifiedAt: number
}

function requireDesktop(): void {
  if (!platform.isDesktop) throw new Error('仅 Tauri 客户端支持 WebDAV 备份')
}

export async function getWebDavConfig(): Promise<WebDavConfig> {
  requireDesktop()
  return invoke<WebDavConfig>('get_webdav_config')
}

export async function saveWebDavConfig(
  config: WebDavConfig,
  password?: string,
  clearPassword = false,
): Promise<WebDavConfig> {
  requireDesktop()
  return invoke<WebDavConfig>('save_webdav_config', {
    config,
    password: password || null,
    clearPassword,
  })
}

export async function testWebDavConnection(
  config: WebDavConfig,
  password?: string,
): Promise<void> {
  requireDesktop()
  return invoke('test_webdav_connection', { config, password: password || null })
}

export async function listWebDavBackups(): Promise<WebDavBackupFile[]> {
  requireDesktop()
  return invoke<WebDavBackupFile[]>('list_webdav_backups')
}

export async function uploadWebDavBackup(name: string, data: Uint8Array): Promise<void> {
  requireDesktop()
  return invoke('upload_webdav_backup', data, {
    headers: {
      'x-backup-name': encodeURIComponent(name),
    },
  })
}

export async function downloadWebDavBackup(name: string): Promise<Uint8Array> {
  requireDesktop()
  const res = await invoke<ArrayBuffer | Uint8Array>('download_webdav_backup', { name })
  if (res instanceof Uint8Array) return res
  return new Uint8Array(res)
}
