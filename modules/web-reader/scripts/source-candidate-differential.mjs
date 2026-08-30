#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'

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

function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: new URL('..', import.meta.url), stdio: 'inherit', env })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} 退出码 ${result.status ?? 'unknown'}`)
}

let work
try {
  const fixturePath = option('--fixture')
  const output = option('--output')
  if (fixturePath === output) throw new Error('差分报告不能覆盖输入夹具')
  if (process.platform !== 'win32' && (statSync(fixturePath).mode & 0o077) !== 0) {
    throw new Error('候选夹具必须是私有文件，请设置权限 0600')
  }
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
  if (fixture?.kind !== 'source-audit-rule-differential-fixture') throw new Error('输入不是候选规则差分夹具')
  work = mkdtempSync(join(tmpdir(), 'legado-source-differential-'))
  const tauriOutput = join(work, 'tauri.json')
  const androidOutput = join(work, 'android.json')
  const baseEnv = { ...process.env, LEGADO_SOURCE_CANDIDATE_FIXTURE: fixturePath }
  run('pnpm', ['exec', 'vitest', 'run', 'src/source/audit/SourceCandidateDifferential.test.ts'], {
    ...baseEnv, LEGADO_SOURCE_CANDIDATE_OUTPUT: tauriOutput,
  })
  run('../../gradlew', [
    '-p', '../..', ':app:testDebugUnitTest',
    '--tests', 'io.legado.app.model.analyzeRule.SourceCompatFixtureTest.candidateFixtureProducesActualResult',
    `-PsourceCandidateRun=${Date.now()}`,
  ], { ...baseEnv, LEGADO_SOURCE_CANDIDATE_OUTPUT: androidOutput })
  const tauri = JSON.parse(readFileSync(tauriOutput, 'utf8'))
  const android = JSON.parse(readFileSync(androidOutput, 'utf8'))
  const fixtureHash = createHash('sha256')
    .update(fixture.input.content).update('\0').update(fixture.input.rule).digest('hex')
  const difference = tauri.status !== android.status
    || JSON.stringify(tauri.actual) !== JSON.stringify(android.actual)
  const privacyApproved = fixture.privacyReview?.minimized === true && fixture.privacyReview?.sanitized === true
  const sameInput = tauri.fixtureHash === fixtureHash && android.fixtureHash === fixtureHash
  const report = {
    schemaVersion: 1,
    kind: 'source-audit-rule-differential',
    generatedAt: Date.now(),
    candidateId: fixture.candidateId,
    fixtureHash,
    sameInput,
    tauriActual: tauri,
    androidActual: android,
    difference,
    privacyApproved,
    promotionEligible: sameInput && privacyApproved && difference && android.status === 'completed',
    phaseStatus: !sameInput
      ? 'blocked_input_mismatch'
      : android.status !== 'completed'
        ? 'blocked_android_execution_failed'
        : !privacyApproved
          ? 'blocked_privacy_review'
          : difference
            ? 'confirmed_engine_gap_candidate'
            : 'differential_same_result',
  }
  writePrivateJson(output, report)
} catch (error) {
  console.error(`用法: pnpm audit:sources:differential -- --fixture /绝对路径/fixture.json --output /绝对路径/differential.json\n${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 2
} finally {
  if (work) rmSync(work, { recursive: true, force: true })
}
