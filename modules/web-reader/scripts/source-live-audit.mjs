#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { launchSourceAudit } from './source-audit-launch.mjs'

function readOption(name) {
  const index = process.argv.indexOf(name)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} 缺少参数值`)
  return value
}

function absoluteOption(name, required = false) {
  const value = readOption(name)
  if (!value && required) throw new Error(`${name} 为必填项`)
  if (value && !isAbsolute(value)) throw new Error(`${name} 必须是绝对路径`)
  return value
}

try {
  const output = absoluteOption('--output', true)
  const db = absoluteOption('--db')
  const diagnostics = absoluteOption('--diagnostics')
  const mode = readOption('--mode') || 'quick'
  const concurrency = readOption('--concurrency') || '1'
  const scope = readOption('--scope') || 'all'
  if (!['quick', 'full'].includes(mode)) throw new Error('--mode 只能是 quick 或 full')
  if (!['1', '2', '3'].includes(concurrency)) throw new Error('--concurrency 只能是 1-3')
  if (!['all', 'enabled', 'text', 'image'].includes(scope)) throw new Error('--scope 只能是 all/enabled/text/image')

  const appArgs = [
    '--source-audit-output', output,
    '--source-audit-mode', mode,
    '--source-audit-concurrency', concurrency,
    '--source-audit-scope', scope,
  ]
  if (db) appArgs.push('--source-audit-db', db)
  if (diagnostics) appArgs.push('--source-audit-diagnostics', diagnostics)
  const result = launchSourceAudit(appArgs)
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 2)
  const report = JSON.parse(readFileSync(output, 'utf8'))
  if (report?.kind === 'source-audit-error') process.exit(2)
  const hasFailures = Array.isArray(report?.entries) && report.entries.some(entry =>
    Object.values(entry?.stages || {}).some(stage => stage?.status === 'failed'))
  process.exit(hasFailures ? 1 : 0)
} catch (error) {
  console.error(`用法: pnpm audit:sources:live -- --output /绝对路径/report.json [--db /绝对路径/legado_reader.db] [--diagnostics /绝对路径/目录] [--mode quick|full] [--scope all|enabled|text|image] [--concurrency 1-3]\n${error instanceof Error ? error.message : String(error)}`)
  process.exit(2)
}
