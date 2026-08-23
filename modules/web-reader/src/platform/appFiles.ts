import { platform } from './capabilities'

export async function openAppDataDirectory(): Promise<string> {
  if (!platform.isDesktop) {
    throw new Error('仅 Tauri 客户端支持打开应用文件夹')
  }

  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<string>('open_app_data_dir')
}
