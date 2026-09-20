import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expectedAssets, githubApi, publish, readVersion, validateIdentity } from './desktop-release.mjs'

const version = '1.26.9211'
const tag = `reader-v${version}`
const commit = 'a'.repeat(40)
const marker = `<!-- desktop-release-commit:${commit} -->`
const assets = expectedAssets(version).map(name => {
  const bytes = Buffer.from(name)
  return { name, bytes, hash: createHash('sha256').update(bytes).digest('hex') }
})

function fixture({ draft, failUpload = -1, corrupt = false } = {}) {
  let release = draft
  const stored = []
  const writes = []
  let uploads = 0
  const api = async (route, options = {}) => {
    if (options.method) writes.push([route, options])
    if (route.startsWith('/releases?')) return release ? [release] : []
    if (route === '/releases' && options.method === 'POST') {
      release = { id: 1, upload_url: 'https://uploads.example/assets{?name}', ...options.json }
      return release
    }
    if (route.startsWith('/releases/1/assets?')) return stored.map(({ bytes, ...asset }) => asset)
    if (route.startsWith('https://uploads.example/')) {
      if (uploads++ === failUpload) throw new Error('模拟上传失败')
      const bytes = corrupt ? Buffer.alloc(options.bytes.length) : options.bytes
      stored.push({ id: stored.length + 1, name: new URL(route).searchParams.get('name'),
        size: bytes.length, state: 'uploaded', bytes })
      return stored.at(-1)
    }
    if (route.startsWith('/releases/assets/')) {
      const index = stored.findIndex(asset => asset.id === Number(route.split('/').at(-1)))
      if (options.method === 'DELETE') return stored.splice(index, 1)
      return stored[index].bytes
    }
    if (route === '/releases/1') {
      if (options.method === 'PATCH') Object.assign(release, options.json)
      return release
    }
    throw new Error(`未模拟路由: ${route}`)
  }
  return { api, writes, stored, release: () => release }
}

const run = (state, extra = {}) => publish({ api: state.api, version, tag, commit, assets,
  verifyTag: () => validateIdentity(version, tag, commit, commit), ...extra })

test('版本文件必须完整且一致', () => {
  const read = file => file.endsWith('Cargo.toml') ? `[package]\nversion = "${version}"`
    : file.endsWith('Cargo.lock') ? `name = "legado-reader"\nversion = "${version}"`
      : JSON.stringify({ version })
  assert.equal(readVersion(read), version)
  assert.throws(() => readVersion(file => file.endsWith('package.json') ? '{"version":"1.0.0"}' : read(file)), /不一致/)
  assert.throws(() => readVersion(file => file.endsWith('Cargo.lock') ? '' : read(file)), /四个版本文件/)
})

test('拒绝标签版本不匹配、标签移动和标签不存在', () => {
  assert.throws(() => validateIdentity(version, 'reader-v1.0.0', commit, commit), /版本不一致/)
  assert.throws(() => validateIdentity(version, tag, commit, 'b'.repeat(40)), /提交不一致/)
  assert.throws(() => validateIdentity(version, tag, commit, undefined), /提交不一致/)
})

test('完整上传和校验后才公开', async () => {
  const state = fixture()
  await run(state)
  assert.equal(state.stored.length, 5)
  assert.equal(state.writes[0][1].json.draft, true)
  assert.equal(state.writes.at(-1)[1].json.draft, false)
  assert.equal(state.release().target_commitish, commit)
})

test('正式版和其他提交的草稿不允许写入', async () => {
  for (const draft of [
    { tag_name: tag, draft: false },
    { tag_name: tag, draft: true, target_commitish: 'b'.repeat(40), body: marker },
  ]) {
    const state = fixture({ draft })
    await assert.rejects(run(state), /禁止/)
    assert.equal(state.writes.length, 0)
  }
})

test('上传中断保留草稿；重试复用相同附件并补齐', async () => {
  const state = fixture({ failUpload: 2 })
  await assert.rejects(run(state), /上传失败/)
  assert.equal(state.release().draft, true)
  assert.equal(state.stored.length, 2)
  await run(state)
  assert.equal(state.stored.length, 5)
  assert.equal(state.release().draft, false)
})

test('重试时不同附件不覆盖', async () => {
  const state = fixture({ failUpload: 1 })
  await assert.rejects(run(state))
  state.stored[0].bytes = Buffer.from('changed')
  const count = state.writes.length
  await assert.rejects(run(state), /禁止覆盖/)
  assert.equal(state.writes.length, count)
})

test('上传失败遗留的 starter 占位可恢复', async () => {
  const state = fixture({ failUpload: 0 })
  await assert.rejects(run(state))
  state.stored.push({ id: 99, name: assets[0].name, state: 'starter', size: 0, bytes: Buffer.alloc(0) })
  await run(state)
  assert.equal(state.release().draft, false)
  assert.equal(state.stored.length, 5)
})

test('缺失或损坏的附件不能公开', async () => {
  const missing = fixture()
  await assert.rejects(run(missing, { assets: assets.slice(1) }), /五种产物/)
  assert.equal(missing.writes.length, 0)
  const corrupt = fixture({ corrupt: true })
  await assert.rejects(run(corrupt), /不完整|校验失败/)
  assert.equal(corrupt.release().draft, true)
})

test('上传期间标签移动时停止公开', async () => {
  const state = fixture()
  let count = 0
  await assert.rejects(run(state, { verifyTag() {
    if (count++) throw new Error('远程标签发生变化')
  } }), /标签发生变化/)
  assert.equal(state.release().draft, true)
})

test('API 权限和网络错误传播，不尝试创建 Release', async () => {
  const state = fixture()
  await assert.rejects(run(state, { api: async () => { throw new Error('HTTP 403') } }), /403/)
  assert.equal(state.writes.length, 0)
})

test('HTTP 失败不会解析为成功响应', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 403 }))
  await assert.rejects(githubApi({ GITHUB_REPOSITORY: 'owner/repo' })('/releases'), /HTTP 403/)
})

test('prepare 在真实 Git 仓库校验标签、固定 SHA，并支持只构建模式', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-release-test-'))
  t.after(() => {
    const relative = path.relative(os.tmpdir(), root)
    assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative))
    fs.rmSync(root, { recursive: true, force: true })
  })
  const repo = path.join(root, 'repo')
  const remote = path.join(root, 'remote.git')
  fs.mkdirSync(repo)
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '--bare', remote)
  git('init')
  const base = path.join(repo, 'modules/web-reader')
  fs.mkdirSync(path.join(base, 'src-tauri'), { recursive: true })
  fs.writeFileSync(path.join(base, 'package.json'), JSON.stringify({ version }))
  fs.writeFileSync(path.join(base, 'src-tauri/tauri.conf.json'), JSON.stringify({ version }))
  fs.writeFileSync(path.join(base, 'src-tauri/Cargo.toml'), `[package]\nversion = "${version}"\n`)
  fs.writeFileSync(path.join(base, 'src-tauri/Cargo.lock'), `name = "legado-reader"\nversion = "${version}"\n`)
  git('add', '.')
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', '测试版本')
  const sha = git('rev-parse', 'HEAD')
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'tag', '-a', tag, '-m', '测试标签')
  git('tag', 'reader-v1.0.0')
  git('remote', 'add', 'origin', remote)
  git('push', 'origin', '--tags')
  const output = path.join(root, 'output')
  const script = fileURLToPath(new URL('./desktop-release.mjs', import.meta.url))
  const prepare = (releaseTag, event = 'workflow_dispatch') => {
    fs.writeFileSync(output, '')
    execFileSync(process.execPath, [script, 'prepare'], { cwd: repo,
      env: { ...process.env, RELEASE_TAG: releaseTag, GITHUB_REF_NAME: releaseTag,
        GITHUB_EVENT_NAME: event, GITHUB_OUTPUT: output }, stdio: ['ignore', 'pipe', 'pipe'] })
    return fs.readFileSync(output, 'utf8')
  }
  assert.match(prepare(tag), new RegExp(`commit=${sha}`))
  assert.match(prepare(tag, 'push'), /publish=true/)
  assert.match(prepare(''), /tag=\n.*\npublish=false/)
  assert.throws(() => prepare('reader-v1.0.0'), /版本不一致/)
  assert.throws(() => prepare('reader-v9.9.9'))
  assert.throws(() => prepare('main'), /标签格式/)
  fs.writeFileSync(path.join(repo, 'change.txt'), 'new commit')
  git('add', '.')
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', '后续提交')
  assert.match(prepare(tag), new RegExp(`commit=${sha}`))
  assert.throws(() => prepare(tag, 'push'), /偏离/)
})
