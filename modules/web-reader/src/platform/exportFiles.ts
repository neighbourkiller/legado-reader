import { platform } from './capabilities'

const TXT_FILTERS = [{ name: '文本文档', extensions: ['txt'] }]
const ZIP_FILTERS = [{ name: 'ZIP 压缩包', extensions: ['zip'] }]

/**
 * 跨平台保存单个文本文件
 * 桌面端弹出原生另存为对话框，Web 端触发浏览器下载
 */
export async function saveTextFile(content: string, defaultName: string): Promise<string | null> {
  const fileContent = '\ufeff' + content
  if (platform.isDesktop) {
    const [{ save }, { writeFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ])
    const path = await save({ defaultPath: defaultName, filters: TXT_FILTERS })
    if (!path) return null
    const bytes = new TextEncoder().encode(fileContent)
    await writeFile(path, bytes)
    return path
  }

  // Web 端降级下载
  const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = defaultName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return defaultName
}

/**
 * 跨平台保存 ZIP 文件
 * 桌面端弹出原生另存为对话框，Web 端触发浏览器下载
 */
export async function saveZipFile(bytes: Uint8Array, defaultName: string): Promise<string | null> {
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

  // Web 端降级下载
  const blob = new Blob([bytes], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = defaultName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return defaultName
}

export interface ExportTextFileEntry {
  name: string
  content: string
}

/**
 * 桌面端选择目标目录并批量保存多个文本文件
 */
export async function exportMultipleTextFilesToDirectory(
  files: ExportTextFileEntry[],
): Promise<{ directory: string; count: number } | null> {
  if (!platform.isDesktop) {
    throw new Error('仅桌面端支持直接导出到目录')
  }

  const [{ open }, { writeFile }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/plugin-fs'),
  ])

  const dirResult = await open({
    directory: true,
    multiple: false,
    title: '选择导出目录',
  })

  if (!dirResult) return null
  const directory = Array.isArray(dirResult) ? dirResult[0] : dirResult
  if (!directory) return null

  const sep = directory.includes('\\') ? '\\' : '/'
  const cleanDir = directory.endsWith('/') || directory.endsWith('\\') ? directory.slice(0, -1) : directory

  let writtenCount = 0
  for (const file of files) {
    const filePath = `${cleanDir}${sep}${file.name}`
    const bytes = new TextEncoder().encode('\ufeff' + file.content)
    await writeFile(filePath, bytes)
    writtenCount++
  }

  return { directory, count: writtenCount }
}
