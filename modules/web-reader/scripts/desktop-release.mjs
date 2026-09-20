import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const prefix = 'modules/web-reader/'
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export function readVersion(read) {
  const versions = [
    JSON.parse(read(`${prefix}package.json`)).version,
    JSON.parse(read(`${prefix}src-tauri/tauri.conf.json`)).version,
    read(`${prefix}src-tauri/Cargo.toml`).match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)?.[1],
    read(`${prefix}src-tauri/Cargo.lock`).match(/name = "legado-reader"\r?\nversion = "([^"]+)"/)?.[1],
  ]
  if (!versions.every(value => typeof value === 'string' && stableVersion.test(value))) {
    throw new Error('桌面正式发布要求四个版本文件均包含有效的三段式稳定版本号')
  }
  if (!versions.every(value => value === versions[0])) throw new Error('四个版本文件不一致')
  return versions[0]
}

export function validateIdentity(version, tag, commit, tagCommit) {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('构建提交必须是完整 SHA')
  if (tag !== `reader-v${version}`) throw new Error('发布标签与配置版本不一致')
  if (commit !== tagCommit) throw new Error('远程标签与构建提交不一致')
}

function remoteTagCommit(tag) {
  const lines = git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`)
    .split('\n').map(line => line.split(/\s+/))
  return lines.find(([, ref]) => ref === `refs/tags/${tag}^{}`)?.[0]
    ?? lines.find(([, ref]) => ref === `refs/tags/${tag}`)?.[0]
}

export function expectedAssets(version) {
  return ['linux-x64.deb', 'linux-x64.rpm', 'linux-x64.tar.gz',
    'windows-x64-portable.zip', 'windows-x64-setup.exe']
    .map(suffix => `Legado.Reader_${version}_${suffix}`)
}

export function loadAssets(directory, version) {
  return expectedAssets(version).map(name => {
    const bytes = fs.readFileSync(path.join(directory, name))
    if (!bytes.length) throw new Error(`产物为空: ${name}`)
    return { name, bytes, hash: sha256(bytes) }
  })
}

// 每次调用只接受 GitHub API 的明确成功响应；网络和鉴权错误不能当作“已存在”。
export function githubApi(env) {
  return async (route, { method = 'GET', json, bytes, binary = false } = {}) => {
    const url = route.startsWith('https://') ? route : `${env.GITHUB_API_URL || 'https://api.github.com'}/repos/${env.GITHUB_REPOSITORY}${route}`
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${env.GH_TOKEN}`,
        Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json',
        'Content-Type': bytes ? 'application/octet-stream' : 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: bytes ?? (json === undefined ? undefined : JSON.stringify(json)),
      signal: AbortSignal.timeout(300_000),
    })
    if (!response.ok) throw new Error(`GitHub API ${method}: HTTP ${response.status}`)
    if (response.status === 204) return undefined
    return binary ? Buffer.from(await response.arrayBuffer()) : response.json()
  }
}

async function listAll(api, route) {
  const result = []
  for (let page = 1; ; page++) {
    const batch = await api(`${route}?per_page=100&page=${page}`)
    result.push(...batch)
    if (batch.length < 100) return result
  }
}

export async function publish({ api, version, tag, commit, assets, verifyTag }) {
  const expected = expectedAssets(version)
  if (assets.length !== expected.length || new Set(assets.map(asset => asset.name)).size !== expected.length
    || expected.some(name => !assets.some(asset => asset.name === name && asset.bytes.length))) {
    throw new Error('发布必须包含完整的五种产物')
  }
  await verifyTag()
  const marker = `<!-- desktop-release-commit:${commit} -->`
  let release = (await listAll(api, '/releases')).find(item => item.tag_name === tag)
  if (release) {
    if (!release.draft) throw new Error('正式版已公开，禁止覆盖；新提交请发布新版本')
    if (release.target_commitish !== commit || !release.body?.includes(marker)) {
      throw new Error('已有草稿不属于本次构建提交，禁止修改')
    }
  } else {
    release = await api('/releases', { method: 'POST', json: {
      tag_name: tag, target_commitish: commit, name: `Legado Reader v${version}`,
      draft: true, prerelease: false, body: marker, generate_release_notes: true,
    } })
  }

  const existing = await listAll(api, `/releases/${release.id}/assets`)
  if (existing.some(asset => !expected.includes(asset.name))) throw new Error('草稿包含未知附件，请检查后重试')
  for (const asset of assets) {
    let found = existing.find(item => item.name === asset.name)
    // GitHub 上传失败可能留下 starter 占位；仅清理本草稿中未完成的附件。
    if (found?.state === 'starter') {
      await api(`/releases/assets/${found.id}`, { method: 'DELETE' })
      found = undefined
    }
    if (found) {
      const bytes = await api(`/releases/assets/${found.id}`, { binary: true })
      if (sha256(bytes) !== asset.hash) throw new Error(`草稿附件内容不同，禁止覆盖: ${asset.name}`)
    } else {
      await api(`${release.upload_url.split('{')[0]}?name=${encodeURIComponent(asset.name)}`, {
        method: 'POST', bytes: asset.bytes,
      })
    }
  }

  const uploaded = await listAll(api, `/releases/${release.id}/assets`)
  if (uploaded.length !== assets.length) throw new Error('上传后的附件数量不正确')
  for (const asset of assets) {
    const found = uploaded.find(item => item.name === asset.name)
    if (!found || found.size !== asset.bytes.length || found.state !== 'uploaded') {
      throw new Error(`上传后的附件不完整: ${asset.name}`)
    }
    const bytes = await api(`/releases/assets/${found.id}`, { binary: true })
    if (sha256(bytes) !== asset.hash) throw new Error(`上传后的附件校验失败: ${asset.name}`)
  }
  await verifyTag()
  const latest = await api(`/releases/${release.id}`)
  if (!latest.draft || latest.target_commitish !== commit || !latest.body?.includes(marker)) {
    throw new Error('发布期间草稿状态发生变化')
  }
  await api(`/releases/${release.id}`, { method: 'PATCH', json: { draft: false, make_latest: 'true' } })
}

async function main() {
  const env = process.env
  if (process.argv[2] === 'prepare') {
    const tag = env.GITHUB_EVENT_NAME === 'push' ? env.GITHUB_REF_NAME : (env.RELEASE_TAG || '').trim()
    if (tag && !/^reader-v\d+\.\d+\.\d+$/.test(tag)) throw new Error('标签格式必须为 reader-v<稳定版本号>')
    if (tag) git('fetch', '--no-tags', 'origin', `refs/tags/${tag}`)
    const commit = git('rev-parse', '--verify', tag ? 'FETCH_HEAD^{commit}' : 'HEAD^{commit}')
    if (env.GITHUB_EVENT_NAME === 'push' && commit !== git('rev-parse', 'HEAD^{commit}')) {
      throw new Error('标签已偏离触发本次工作流的提交')
    }
    const version = readVersion(file => git('show', `${commit}:${file}`))
    if (tag) validateIdentity(version, tag, commit, remoteTagCommit(tag))
    fs.appendFileSync(env.GITHUB_OUTPUT, `version=${version}\ntag=${tag}\ncommit=${commit}\npublish=${Boolean(tag)}\n`)
    return
  }
  if (process.argv[2] !== 'publish') throw new Error('用法: desktop-release.mjs prepare|publish')
  const { RELEASE_VERSION: version, RELEASE_TAG: tag, RELEASE_COMMIT: commit } = env
  const verifyTag = () => validateIdentity(version, tag, commit, remoteTagCommit(tag))
  await publish({ api: githubApi(env), version, tag, commit,
    assets: loadAssets('all-artifacts', version), verifyTag })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
