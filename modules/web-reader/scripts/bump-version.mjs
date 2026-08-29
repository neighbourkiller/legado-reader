import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(scriptDir, '..')
const releaseBranch = 'main'
const releaseTimeZone = 'Asia/Shanghai'

const pkgPath = path.join(rootDir, 'package.json')
const tauriConfPath = path.join(rootDir, 'src-tauri/tauri.conf.json')
const cargoPath = path.join(rootDir, 'src-tauri/Cargo.toml')
const cargoLockPath = path.join(rootDir, 'src-tauri/Cargo.lock')

const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/

const cargoVersionPattern = /(^\[package\][\s\S]*?^version\s*=\s*)"([^"]+)"/gm
const cargoLockVersionPattern = /(name\s*=\s*"legado-reader"\r?\nversion\s*=\s*)"([^"]+)"/g

function printHelp() {
  console.log(`用法: node scripts/bump-version.mjs [版本号] [选项]

不指定版本号时，按 Asia/Shanghai 日期生成 1.YY.MDDN 格式的版本号。
例如 2026-08-29 当天依次生成 1.26.8290、1.26.8291……1.26.8299。

选项:
  --git      更新版本后创建发布提交和 reader-v<版本号> 标签
  --dry-run  仅显示计划，不修改文件或 Git 状态
  --help     显示帮助
`)
}

function parseArgs(args) {
  const allowedFlags = new Set(['--git', '--dry-run', '--help'])
  const unknownFlags = args.filter(arg => arg.startsWith('--') && !allowedFlags.has(arg))
  const versions = args.filter(arg => !arg.startsWith('--'))

  if (unknownFlags.length > 0) {
    throw new Error(`未知选项: ${unknownFlags.join(', ')}`)
  }
  if (versions.length > 1) {
    throw new Error(`只能指定一个版本号，收到: ${versions.join(', ')}`)
  }

  return {
    isGit: args.includes('--git'),
    isDryRun: args.includes('--dry-run'),
    isHelp: args.includes('--help'),
    versionArg: versions[0],
  }
}

function parseSemver(version, label) {
  const match = semverPattern.exec(version)
  if (!match) {
    throw new Error(`${label}不是有效的 SemVer: ${version}`)
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split('.') ?? [],
  }
}

function compareSemver(leftVersion, rightVersion) {
  const left = parseSemver(leftVersion, '待比较版本')
  const right = parseSemver(rightVersion, '待比较版本')

  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1
  }

  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0
  if (left.prerelease.length === 0) return 1
  if (right.prerelease.length === 0) return -1

  const length = Math.max(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index]
    const rightPart = right.prerelease[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    if (leftPart === rightPart) continue

    const leftIsNumber = /^\d+$/.test(leftPart)
    const rightIsNumber = /^\d+$/.test(rightPart)
    if (leftIsNumber && rightIsNumber) return Number(leftPart) > Number(rightPart) ? 1 : -1
    if (leftIsNumber) return -1
    if (rightIsNumber) return 1
    return leftPart > rightPart ? 1 : -1
  }

  return 0
}

function readSingleMatch(content, pattern, label) {
  pattern.lastIndex = 0
  const matches = [...content.matchAll(pattern)]
  if (matches.length !== 1) {
    throw new Error(`${label}应当恰好匹配一次，实际匹配 ${matches.length} 次`)
  }
  return matches[0][2]
}

function replaceSingleVersion(content, pattern, currentVersion, newVersion, label) {
  let replacements = 0
  pattern.lastIndex = 0
  const updated = content.replace(pattern, (match, prefix, matchedVersion) => {
    replacements += 1
    if (matchedVersion !== currentVersion) {
      throw new Error(`${label}版本在更新前发生变化: ${matchedVersion}`)
    }
    return `${prefix}"${newVersion}"`
  })

  if (replacements !== 1) {
    throw new Error(`${label}应当恰好更新一次，实际更新 ${replacements} 次`)
  }
  return updated
}

function readVersionState() {
  const pkgContent = fs.readFileSync(pkgPath, 'utf8')
  const tauriConfContent = fs.readFileSync(tauriConfPath, 'utf8')
  const cargoContent = fs.readFileSync(cargoPath, 'utf8')
  const hasCargoLock = fs.existsSync(cargoLockPath)
  const cargoLockContent = hasCargoLock ? fs.readFileSync(cargoLockPath, 'utf8') : undefined

  const pkg = JSON.parse(pkgContent)
  const tauriConf = JSON.parse(tauriConfContent)
  const versions = [
    ['package.json', pkg.version],
    ['src-tauri/tauri.conf.json', tauriConf.version],
    ['src-tauri/Cargo.toml', readSingleMatch(cargoContent, cargoVersionPattern, 'Cargo.toml [package].version')],
  ]

  if (cargoLockContent !== undefined) {
    versions.push([
      'src-tauri/Cargo.lock',
      readSingleMatch(cargoLockContent, cargoLockVersionPattern, 'Cargo.lock legado-reader version'),
    ])
  }

  for (const [label, version] of versions) {
    if (typeof version !== 'string') throw new Error(`${label} 缺少字符串类型的版本号`)
    parseSemver(version, `${label} 中的版本号`)
  }

  const currentVersion = versions[0][1]
  if (versions.some(([, version]) => version !== currentVersion)) {
    const details = versions.map(([label, version]) => `  ${label}: ${version}`).join('\n')
    throw new Error(`版本文件当前不一致，请先确认正确版本后再执行:\n${details}`)
  }

  return {
    currentVersion,
    pkg,
    tauriConf,
    cargoContent,
    cargoLockContent,
    originals: new Map([
      [pkgPath, pkgContent],
      [tauriConfPath, tauriConfContent],
      [cargoPath, cargoContent],
      ...(cargoLockContent === undefined ? [] : [[cargoLockPath, cargoLockContent]]),
    ]),
  }
}

function getDateParts() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: releaseTimeZone,
    year: '2-digit',
    month: 'numeric',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  }
}

function calculateDateVersion(currentVersion) {
  const current = parseSemver(currentVersion, '当前版本')
  const { year, month, day } = getDateParts()
  const dateCode = Number(`${month}${String(day).padStart(2, '0')}`)
  const firstPatchOfDay = dateCode * 10
  const lastPatchOfDay = firstPatchOfDay + 9

  let patch = firstPatchOfDay
  if (
    current.major === 1 &&
    current.minor === year &&
    current.patch >= firstPatchOfDay &&
    current.patch <= lastPatchOfDay
  ) {
    if (current.patch === lastPatchOfDay) {
      throw new Error('当天自动版本号已用完（最多 10 个），请显式指定更高版本')
    }
    patch = current.patch + 1
  }

  return `1.${year}.${patch}`
}

function buildUpdatedContents(state, newVersion) {
  const pkg = { ...state.pkg, version: newVersion }
  const tauriConf = { ...state.tauriConf, version: newVersion }
  const updated = new Map([
    [pkgPath, `${JSON.stringify(pkg, null, 2)}\n`],
    [tauriConfPath, `${JSON.stringify(tauriConf, null, 2)}\n`],
    [
      cargoPath,
      replaceSingleVersion(
        state.cargoContent,
        cargoVersionPattern,
        state.currentVersion,
        newVersion,
        'Cargo.toml [package].version',
      ),
    ],
  ])

  if (state.cargoLockContent !== undefined) {
    updated.set(
      cargoLockPath,
      replaceSingleVersion(
        state.cargoLockContent,
        cargoLockVersionPattern,
        state.currentVersion,
        newVersion,
        'Cargo.lock legado-reader version',
      ),
    )
  }

  return updated
}

function runGit(args, options = {}) {
  return execFileSync('git', args, {
    cwd: options.cwd ?? rootDir,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })
}

function gitRefExists(repoRoot, ref) {
  try {
    runGit(['show-ref', '--verify', '--quiet', ref], { cwd: repoRoot, capture: true })
    return true
  } catch (error) {
    if (error.status === 1) return false
    throw error
  }
}

function remoteTagExists(repoRoot, tagName) {
  try {
    runGit(['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${tagName}`], {
      cwd: repoRoot,
      capture: true,
    })
    return true
  } catch (error) {
    if (error.status === 2) return false
    throw new Error(`无法检查远程标签 ${tagName}: ${error.stderr?.trim() || error.message}`)
  }
}

function preflightGit(tagName) {
  const repoRoot = runGit(['rev-parse', '--show-toplevel'], { capture: true }).trim()
  const branch = runGit(['branch', '--show-current'], { cwd: repoRoot, capture: true }).trim()
  if (branch !== releaseBranch) {
    throw new Error(`发布提交只能在 ${releaseBranch} 分支创建，当前分支: ${branch || '(detached HEAD)'}`)
  }

  const status = runGit(['status', '--porcelain', '--untracked-files=normal'], {
    cwd: repoRoot,
    capture: true,
  }).trim()
  if (status) {
    throw new Error(`--git 模式要求工作区和暂存区干净，请先处理以下改动:\n${status}`)
  }

  if (gitRefExists(repoRoot, `refs/tags/${tagName}`)) {
    throw new Error(`标签已存在: ${tagName}`)
  }
  if (remoteTagExists(repoRoot, tagName)) {
    throw new Error(`远程标签已存在: ${tagName}`)
  }

  runGit(['var', 'GIT_AUTHOR_IDENT'], { cwd: repoRoot, capture: true })
  const headBefore = runGit(['rev-parse', 'HEAD'], { cwd: repoRoot, capture: true }).trim()
  return { repoRoot, headBefore }
}

function writeAndVerify(updatedContents, originals, newVersion) {
  try {
    for (const [filePath, content] of updatedContents) fs.writeFileSync(filePath, content, 'utf8')
    const writtenState = readVersionState()
    if (writtenState.currentVersion !== newVersion) {
      throw new Error(`写入后版本校验失败: ${writtenState.currentVersion}`)
    }
  } catch (error) {
    for (const [filePath, content] of originals) fs.writeFileSync(filePath, content, 'utf8')
    throw error
  }
}

function createReleaseCommit(repoRoot, files, newVersion, tagName) {
  const relativeFiles = files.map(filePath => path.relative(repoRoot, filePath))
  runGit(['add', '--', ...relativeFiles], { cwd: repoRoot })
  runGit(['commit', '-m', `chore(release): bump desktop version to ${newVersion}`], { cwd: repoRoot })
  runGit(['tag', '-a', tagName, '-m', `Legado Reader ${newVersion}`], { cwd: repoRoot })
}

function restoreAfterGitFailure(gitState, files, originals, error) {
  const headAfter = runGit(['rev-parse', 'HEAD'], { cwd: gitState.repoRoot, capture: true }).trim()
  if (headAfter !== gitState.headBefore) {
    throw new Error(`发布提交已经创建，但标签创建失败，请手动检查 Git 状态: ${error.message}`)
  }

  const relativeFiles = files.map(filePath => path.relative(gitState.repoRoot, filePath))
  runGit(['restore', '--staged', '--', ...relativeFiles], { cwd: gitState.repoRoot })
  for (const [filePath, content] of originals) fs.writeFileSync(filePath, content, 'utf8')
  throw new Error(`Git 提交失败，版本文件已恢复: ${error.message}`)
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.isHelp) {
    printHelp()
    return
  }

  const state = readVersionState()
  const newVersion = options.versionArg ?? calculateDateVersion(state.currentVersion)
  parseSemver(newVersion, '新版本号')
  if (compareSemver(newVersion, state.currentVersion) <= 0) {
    throw new Error(`新版本必须高于当前版本: ${state.currentVersion} -> ${newVersion}`)
  }

  const tagName = `reader-v${newVersion}`
  const updatedContents = buildUpdatedContents(state, newVersion)

  console.log(`\n🚀 版本更新计划: ${state.currentVersion} -> ${newVersion}`)
  for (const filePath of updatedContents.keys()) {
    console.log(`  - ${path.relative(rootDir, filePath)}`)
  }

  if (options.isDryRun) {
    console.log('\n🔎 dry-run 完成：未修改文件或 Git 状态')
    if (options.isGit) console.log(`  将在干净的 ${releaseBranch} 分支创建提交和标签 ${tagName}`)
    return
  }

  const gitState = options.isGit ? preflightGit(tagName) : undefined
  writeAndVerify(updatedContents, state.originals, newVersion)
  console.log(`\n✅ ${updatedContents.size} 个版本文件已同步为 ${newVersion}`)

  if (options.isGit) {
    const files = [...updatedContents.keys()]
    try {
      createReleaseCommit(gitState.repoRoot, files, newVersion, tagName)
    } catch (error) {
      restoreAfterGitFailure(gitState, files, state.originals, error)
    }
    console.log(`\n🎉 发布提交与注解标签 ${tagName} 已创建`)
    console.log('👉 推送并触发桌面构建:')
    console.log(`   git push origin ${releaseBranch} ${tagName}\n`)
  }
}

try {
  main()
} catch (error) {
  console.error(`\n❌ ${error.message}\n`)
  process.exitCode = 1
}
