#!/usr/bin/env node
import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'

function option(name) {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  if (!value || value.startsWith('--')) throw new Error(`${name} 为必填项`)
  return value
}

function absoluteOption(name) {
  const value = option(name)
  if (!isAbsolute(value)) throw new Error(`${name} 必须是绝对路径`)
  return value
}

function writePrivateJson(path, value) {
  const parent = dirname(path)
  mkdirSync(parent, { recursive: true, mode: 0o700 })
  if (process.platform !== 'win32' && (statSync(parent).mode & 0o077) !== 0) {
    throw new Error('输出目录必须仅允许当前用户访问，请设置权限 0700')
  }
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  chmodSync(temporary, 0o600)
  renameSync(temporary, path)
}

function readPath(value, path) {
  return String(path).split('.').reduce((current, key) => current?.[key], value)
}

try {
  const diagnosticsPath = absoluteOption('--diagnostics')
  const replayPath = absoluteOption('--replay')
  const output = absoluteOption('--output')
  const candidateId = option('--candidate')
  if (process.platform !== 'win32' && (statSync(diagnosticsPath).mode & 0o077) !== 0) {
    throw new Error('诊断包必须是私有文件，请设置权限 0600')
  }
  const diagnostics = JSON.parse(readFileSync(diagnosticsPath, 'utf8'))
  const replay = JSON.parse(readFileSync(replayPath, 'utf8'))
  const result = replay.results?.find(item => `${item.sourceId}:${item.stage}` === candidateId)
  if (!result) throw new Error(`重放报告中不存在候选 ${candidateId}`)
  if (result.attribution?.state !== 'ready_for_differential') {
    throw new Error(`候选尚未达到差分准入状态: ${result.attribution?.state || 'unresolved'}`)
  }
  if (!result.field) throw new Error('候选缺少失败字段')
  const item = diagnostics.cases?.find(value => value.sourceId === result.sourceId)
  if (!item) throw new Error('诊断包中不存在候选书源')
  const request = [...(item.requests || [])].reverse()
    .find(value => value.stage === result.stage && (value.transformedBody ?? value.body))
  if (!request) throw new Error('候选没有可重放响应')
  const rule = readPath(item.source, result.field)
  if (typeof rule !== 'string' || !rule.trim()) throw new Error(`失败字段 ${result.field} 不是可执行字符串规则`)
  const content = request.transformedBody ?? request.body
  const fixture = {
    schemaVersion: 1,
    kind: 'source-audit-rule-differential-fixture',
    candidateId,
    sourceId: result.sourceId,
    stage: result.stage,
    field: result.field,
    rawCode: result.rawCode,
    execution: /(?:bookList|chapterList)$/.test(result.field) ? 'elements' : 'string',
    input: { content, rule },
    privacyReview: {
      minimized: false,
      sanitized: false,
      note: '自动提取仅供私有诊断；人工最小化并确认脱敏后才能提升为引擎缺口证据',
    },
  }
  writePrivateJson(output, fixture)
} catch (error) {
  console.error(`用法: pnpm audit:sources:extract-candidate -- --diagnostics /绝对路径/diagnostics-v1.json --replay /绝对路径/replay.json --candidate sourceId:stage --output /绝对路径/fixture.json\n${error instanceof Error ? error.message : String(error)}`)
  process.exit(2)
}
