import { platform } from './capabilities'

export async function getAppVersion(): Promise<string> {
  if (!platform.isDesktop) throw new Error('仅 Tauri 客户端支持读取应用版本')
  const { getVersion } = await import('@tauri-apps/api/app')
  return getVersion()
}
