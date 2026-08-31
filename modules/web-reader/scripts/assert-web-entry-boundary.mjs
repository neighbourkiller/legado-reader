import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const outputDirectory = resolve(process.cwd(), 'dist')
const manifestPath = resolve(outputDirectory, '.vite/manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const entryKeys = Object.entries(manifest)
  .filter(([, chunk]) => chunk.isEntry)
  .map(([key]) => key)

if (entryKeys.length !== 1) {
  throw new Error(`Web 构建应只有一个入口，实际发现 ${entryKeys.length} 个: ${entryKeys.join(', ')}`)
}

const visited = new Set()
const violations = []

function inspectStaticChunk(key) {
  if (visited.has(key)) return
  visited.add(key)

  const chunk = manifest[key]
  if (!chunk) throw new Error(`Vite manifest 缺少静态依赖: ${key}`)

  const filePath = resolve(outputDirectory, chunk.file)
  const source = readFileSync(filePath, 'utf8')
  if (/__TAURI_INTERNALS__\s*\.\s*invoke/.test(source)) {
    violations.push(chunk.file)
  }

  for (const importedKey of chunk.imports || []) inspectStaticChunk(importedKey)
}

inspectStaticChunk(entryKeys[0])

if (violations.length > 0) {
  throw new Error(`Web 首包静态依赖包含 Tauri IPC: ${violations.join(', ')}`)
}

console.log(`Web 首包平台边界检查通过，共检查 ${visited.size} 个静态 JavaScript chunk。`)
