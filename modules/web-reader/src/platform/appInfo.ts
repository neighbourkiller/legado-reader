import { platform } from './capabilities'
import packageInfo from '../../package.json'

export async function getAppVersion(): Promise<string> {
  if (platform.isDesktop) {
    const { getVersion } = await import('@tauri-apps/api/app')
    return getVersion()
  }
  return packageInfo.version
}
