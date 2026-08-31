import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const roots = [
  resolve(__dirname, '../components'),
  resolve(__dirname, '../views'),
  resolve(__dirname, '../composables'),
  resolve(__dirname, '../source/audit'),
]

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(?:ts|vue)$/.test(entry.name) ? [path] : []
  })
}

describe('平台边界', () => {
  it('UI、组合式函数和审计业务层不直接调用 Tauri', () => {
    const violations = roots.flatMap(sourceFiles).flatMap(path => {
      const source = readFileSync(path, 'utf8')
      return source.includes('@tauri-apps') || source.includes('__TAURI_INTERNALS__')
        ? [path.replace(`${resolve(__dirname, '..')}/`, '')]
        : []
    })

    expect(violations).toEqual([])
  })
})
