import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

// 1. 读取现有文件
const pkgPath = path.join(rootDir, 'package.json')
const tauriConfPath = path.join(rootDir, 'src-tauri/tauri.conf.json')
const cargoPath = path.join(rootDir, 'src-tauri/Cargo.toml')
const cargoLockPath = path.join(rootDir, 'src-tauri/Cargo.lock')

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf-8'))

const args = process.argv.slice(2)
const isGit = args.includes('--git')
const versionArg = args.find(arg => !arg.startsWith('--'))

// 2. 计算新版本号
let newVersion = versionArg
if (!newVersion) {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(-2)
  const m = now.getMonth() + 1
  const d = now.getDate()
  const dateStr = `${m}${d < 10 ? '0' + d : d}`
  const baseDateVersion = `1.${yy}.${dateStr}`

  const currentVersion = tauriConf.version || pkg.version || '1.0.0'
  if (currentVersion === baseDateVersion) {
    newVersion = `${baseDateVersion}1`
  } else if (currentVersion.startsWith(baseDateVersion)) {
    const suffix = currentVersion.slice(baseDateVersion.length)
    const num = parseInt(suffix, 10)
    newVersion = isNaN(num) ? `${baseDateVersion}1` : `${baseDateVersion}${num + 1}`
  } else {
    newVersion = baseDateVersion
  }
}

console.log(`\n🚀 准备更新版本号为: ${newVersion}`)

// 3. 更新 package.json
pkg.version = newVersion
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
console.log(`✔ [1/3] 已更新 package.json -> ${newVersion}`)

// 4. 更新 src-tauri/tauri.conf.json
tauriConf.version = newVersion
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf-8')
console.log(`✔ [2/3] 已更新 src-tauri/tauri.conf.json -> ${newVersion}`)

// 5. 更新 src-tauri/Cargo.toml
let cargoContent = fs.readFileSync(cargoPath, 'utf-8')
cargoContent = cargoContent.replace(/(^\[package\][\s\S]*?^version\s*=\s*)"[^"]+"/m, `$1"${newVersion}"`)
fs.writeFileSync(cargoPath, cargoContent, 'utf-8')
console.log(`✔ [3/3] 已更新 src-tauri/Cargo.toml -> ${newVersion}`)

// 6. 更新 src-tauri/Cargo.lock（若存在）
if (fs.existsSync(cargoLockPath)) {
  let cargoLockContent = fs.readFileSync(cargoLockPath, 'utf-8')
  cargoLockContent = cargoLockContent.replace(/(name\s*=\s*"legado-reader"\r?\nversion\s*=\s*)"[^"]+"/g, `$1"${newVersion}"`)
  fs.writeFileSync(cargoLockPath, cargoLockContent, 'utf-8')
  console.log(`✔ 附带更新 src-tauri/Cargo.lock -> ${newVersion}`)
}

console.log(`\n✅ 版本号同步完成！当前版本: ${newVersion}\n`)

// 7. Git 自动提交与打 Tag
if (isGit) {
  try {
    const filesToStage = [pkgPath, tauriConfPath, cargoPath]
    if (fs.existsSync(cargoLockPath)) filesToStage.push(cargoLockPath)
    
    execSync(`git add ${filesToStage.map(f => `"${f}"`).join(' ')}`, { stdio: 'inherit' })
    execSync(`git commit -m "chore(release): bump desktop version to ${newVersion}"`, { stdio: 'inherit' })
    execSync(`git tag reader-v${newVersion}`, { stdio: 'inherit' })
    console.log(`🎉 Git 提交与 Tag [reader-v${newVersion}] 创建成功！`)
    console.log(`👉 执行以下命令推送到远程以触发自动构建与发布:\n`)
    console.log(`   git push origin main reader-v${newVersion}\n`)
  } catch (err) {
    console.error('❌ Git 操作失败:', err.message)
    process.exit(1)
  }
}
