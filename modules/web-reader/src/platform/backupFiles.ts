import { platform } from './capabilities'
import { saveZipFile } from './exportFiles'

const ZIP_FILTERS = [{ name: 'Legado 备份', extensions: ['zip'] }]

export async function chooseBackupFile(): Promise<{ path: string; bytes: Uint8Array } | null> {
  if (platform.isDesktop) {
    const [{ open }, { readFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ])
    const path = await open({ multiple: false, directory: false, filters: ZIP_FILTERS })
    if (!path) return null
    return { path, bytes: await readFile(path) }
  }

  if (typeof document === 'undefined') throw new Error('当前环境不支持选择备份文件')

  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip,application/zip'
    input.hidden = true
    document.body.appendChild(input)

    let settled = false
    const cleanup = () => input.remove()
    const finish = (value: { path: string; bytes: Uint8Array } | null) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }

    input.addEventListener('cancel', () => finish(null), { once: true })
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      if (!file) {
        finish(null)
        return
      }
      if (!file.name.toLowerCase().endsWith('.zip')) {
        fail(new Error('请选择 ZIP 格式的 Legado 备份文件'))
        return
      }
      try {
        finish({ path: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })
      } catch (error) {
        fail(error)
      }
    }, { once: true })
    input.click()
  })
}

export async function saveBackupFile(bytes: Uint8Array, defaultName: string): Promise<string | null> {
  if (platform.isDesktop) {
    const [{ save }, { writeFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ])
    const path = await save({ defaultPath: defaultName, filters: ZIP_FILTERS })
    if (!path) return null
    await writeFile(path, bytes)
    return path
  }
  return saveZipFile(bytes, defaultName)
}
