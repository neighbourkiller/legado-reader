#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const auditContract = JSON.parse(readFileSync(
  new URL('../../../testdata/source-compat/audit-contract.json', import.meta.url), 'utf8',
))

const dbPath = process.argv.slice(2).find(argument => argument !== '--')
if (!dbPath || !existsSync(dbPath)) {
  console.error('用法: pnpm audit:sources -- /绝对路径/legado_reader.db')
  process.exit(2)
}

const raw = execFileSync('sqlite3', ['-json', dbPath, 'SELECT data_json FROM book_sources ORDER BY custom_order, book_source_url'], {
  encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
})
const rows = JSON.parse(raw || '[]')
const apiPatterns = [
  [/\bPackages\b|\bjava\.(?:lang|util|security|io|net)\b/, 'UNSUPPORTED_ANDROID_API'],
  [/\b(?:context|activity)\./, 'UNSUPPORTED_ANDROID_UI'],
  [/"serverID"\s*:/, 'UNSUPPORTED_SERVER_ID'],
]

const entries = rows.map(({ data_json: json }) => {
  const source = JSON.parse(json)
  const serialized = JSON.stringify(source)
  const rawType = source.bookSourceType
  const type = typeof rawType === 'number' && Number.isInteger(rawType) ? rawType : null
  const capabilities = new Set()
  if (/@?xpath:|(?:^|["'])\/\//i.test(serialized)) capabilities.add('xpath')
  if (/@?json:|\$\.|\$\[/i.test(serialized)) capabilities.add('jsonpath')
  if (/@?regex:|##/.test(serialized)) capabilities.add('regex')
  if (/@js:|<js>|\{\{/.test(serialized)) capabilities.add('javascript')
  if (/@put:|@get:/.test(serialized)) capabilities.add('variables')
  if (source.mainJs) capabilities.add('main-js')
  if (source.loginUrl) capabilities.add('manual-login')
  if (source.loginUi) capabilities.add('login-ui')
  if (source.useWebView || /webJs/i.test(serialized)) capabilities.add('webview')
  if (source.ruleContent?.imageDecode) capabilities.add('image-decode')
  const errorCodes = []
  if (type === null) errorCodes.push('INVALID_SOURCE_TYPE')
  else if (![0, 2].includes(type)) errorCodes.push('UNSUPPORTED_SOURCE_TYPE')
  if (source.loginUi) errorCodes.push('UNSUPPORTED_LOGIN_UI')
  if (source.ruleContent?.callBackJs) errorCodes.push('UNSUPPORTED_CALLBACK_JS')
  for (const [pattern, code] of apiPatterns) if (pattern.test(serialized)) errorCodes.push(code)
  const id = createHash('sha256').update(String(source.bookSourceUrl || '')).digest('hex').slice(0, 12)
  return {
    id, type, capabilities: [...capabilities].sort(), errorCodes: [...new Set(errorCodes)].sort(),
    stages: Object.fromEntries(['import', 'search', 'bookInfo', 'toc', 'content'].map(stage => [stage, 'untested'])),
  }
})

const summary = {
  schemaVersion: auditContract.schemaVersion,
  engineVersion: auditContract.engineVersion,
  generatedAt: new Date().toISOString(),
  sourceCount: entries.length,
  targetCount: entries.filter(item => [0, 2].includes(item.type)).length,
  unsupportedTypeCount: entries.filter(item => item.errorCodes.some(code => code === 'UNSUPPORTED_SOURCE_TYPE' || code === 'INVALID_SOURCE_TYPE')).length,
  entries,
}
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
