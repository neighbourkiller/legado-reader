#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { launchSourceAudit } from './source-audit-launch.mjs'

function readRequired(name) {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  if (!value || value.startsWith('--')) throw new Error(`${name} 为必填项`)
  if (!isAbsolute(value)) throw new Error(`${name} 必须是绝对路径`)
  return value
}

try {
  const input = readRequired('--input')
  const output = readRequired('--output')
  const result = launchSourceAudit([
    '--source-audit-output', output,
    '--source-audit-replay', input,
  ])
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 2)
  const report = JSON.parse(readFileSync(output, 'utf8'))
  if (report?.kind === 'source-audit-error') process.exit(2)
  const hasFailures = Array.isArray(report?.results)
    && report.results.some(item => item?.status === 'failed')
  process.exit(hasFailures ? 1 : 0)
} catch (error) {
  console.error(`用法: pnpm audit:sources:replay -- --input /绝对路径/diagnostics-v1.json --output /绝对路径/replay.json\n${error instanceof Error ? error.message : String(error)}`)
  process.exit(2)
}
