#!/usr/bin/env node
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync, chmodSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'

function option(name) {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  if (!value || value.startsWith('--') || !isAbsolute(value)) throw new Error(`${name} 必须是绝对路径`)
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

try {
  const input = option('--input')
  const output = option('--output')
  if (input === output) throw new Error('候选清单不能覆盖重放报告')
  const replay = JSON.parse(readFileSync(input, 'utf8'))
  if (replay?.kind !== 'source-audit-replay' || !Array.isArray(replay.results)) {
    throw new Error('输入不是书源重放报告')
  }
  const relevant = replay.results.filter(item => [
    'RULE_OR_ENGINE_SEMANTICS', 'SCRIPT_OR_HOST_SEMANTICS',
  ].includes(item?.attribution?.candidateCause))
  const candidates = relevant.map(item => ({
    candidateId: `${item.sourceId}:${item.stage}`,
    sourceId: item.sourceId,
    sourceName: item.sourceName,
    stage: item.stage,
    field: item.field,
    rawCode: item.rawCode,
    replayStatus: item.status,
    responseKind: item.responseEligibility?.kind || 'unknown',
    responseEvidence: item.responseEligibility?.evidence || 'LEGACY_REPORT_WITHOUT_RESPONSE_GATE',
    state: item.attribution?.state || 'unresolved',
    candidateCause: item.attribution?.candidateCause,
    differentialReady: item.attribution?.state === 'ready_for_differential',
  }))
  const readyCount = candidates.filter(item => item.differentialReady).length
  const manifest = {
    schemaVersion: 1,
    kind: 'source-audit-candidate-manifest',
    generatedAt: Date.now(),
    replayGeneratedAt: replay.generatedAt,
    phaseStatus: readyCount > 0 ? 'ready' : candidates.length > 0 ? 'blocked' : 'not_applicable',
    summary: {
      candidateCount: candidates.length,
      readyCount,
      blockedCount: candidates.length - readyCount,
    },
    candidates,
  }
  writePrivateJson(output, manifest)
} catch (error) {
  console.error(`用法: pnpm audit:sources:candidates -- --input /绝对路径/replay.json --output /绝对路径/candidates.json\n${error instanceof Error ? error.message : String(error)}`)
  process.exit(2)
}
