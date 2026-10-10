# Web 与桌面客户端操作指南

本文中的命令使用 **PowerShell 7**。除特别说明外，均在 `modules/web-reader` 目录执行。

## 1. 进入目录与安装依赖

```powershell
Set-Location D:\develop\Projects\legado\modules\web-reader
pnpm install --frozen-lockfile
```

当前 CI 使用 Node.js 22 和 pnpm 9.15.9，本地可使用相同版本。先检查环境：

```powershell
node --version
pnpm --version
```

桌面端还需要 Rust 的 MSVC 工具链、Visual Studio Build Tools 的“使用 C++ 的桌面开发”组件（含 Windows SDK）以及 WebView2 Runtime。

```powershell
rustc --version
cargo --version
rustup show active-toolchain
```

首次安装或依赖锁文件更新后，重新执行 `pnpm install --frozen-lockfile`。开发服务器使用 `Ctrl+C` 停止。

## 2. Web 版调试

```powershell
Set-Location D:\develop\Projects\legado\modules\web-reader
pnpm dev:web
```

在浏览器打开终端输出的地址。未额外配置端口时通常为 `http://localhost:5173`，端口被占用时以终端输出为准。前端修改支持热更新，可使用浏览器开发者工具查看 Console、Network 和 IndexedDB。

`pnpm dev` 与 `pnpm dev:web` 当前执行相同的 Web 开发脚本。

### Web 构建与本地预览

```powershell
pnpm build:web
pnpm preview
```

`build:web` 依次进行 TypeScript 类型检查、Web 构建和 Web 入口边界检查；输出到当前目录下的 `dist`。`preview` 用于查看构建产物，访问地址以终端输出为准，通常为 `http://localhost:4173`。

`pnpm build` 当前等同于 `pnpm build:web`。

### Web 部署到 GitHub Pages

当前 [Deploy Web Reader to GitHub Pages](../../.github/workflows/deploy-web-reader.yml) 工作流在 `main` 分支收到 `modules/web-reader/**` 或该工作流文件的提交时触发，也可以在 GitHub Actions 页面手动运行。

将需要部署的修改提交到 `main` 后推送：

```powershell
git push origin main
```

工作流负责测试、类型检查、按 Pages 的基础路径构建和部署。仓库的 GitHub Pages 需要配置为使用 GitHub Actions；本地执行 `pnpm build:web` 只生成文件，不会部署。

## 3. 桌面客户端调试

```powershell
Set-Location D:\develop\Projects\legado\modules\web-reader
pnpm dev:desktop
```

该命令启动 Tauri 开发模式，自动执行 `pnpm dev:desktop-ui`，编译 Rust 后打开客户端窗口。当前前端地址为 `http://localhost:11621`，由 `package.json` 与 `src-tauri/tauri.conf.json` 共同配置。通常无需另开终端启动前端服务。

前端修改支持热更新；Rust 修改由 Tauri 开发流程重新编译。首次启动可能需要下载和编译 Rust 依赖。

### 只调试桌面前端 UI

```powershell
pnpm dev:desktop-ui
```

此命令仅启动桌面模式的 Vite 前端，可在浏览器访问 `http://localhost:11621`。需要 Tauri IPC、数据库或原生文件系统的功能，应使用 `pnpm dev:desktop` 在客户端窗口中验证。

### 只构建桌面前端 UI

```powershell
pnpm build:desktop-ui
```

该命令进行类型检查并输出桌面前端文件到 `dist`，不编译 Rust，也不生成 EXE。Web 和桌面前端构建共用 `dist`，后一次构建会更新该目录；预览 Web 前请重新执行 `pnpm build:web`。

## 4. Windows 本地打包

### 生成 setup.exe 安装包

```powershell
Set-Location D:\develop\Projects\legado\modules\web-reader
pnpm tauri build --bundles nsis
```

当前 Windows 配置只启用 NSIS，因此也可以直接执行：

```powershell
pnpm build:desktop
```

以上两条是可选的构建方式，任选一条即可。Tauri 会自动执行 `pnpm build:desktop-ui`，随后编译 Rust 并打包安装程序。

在默认 Windows x64 构建环境、未覆盖 Cargo 输出目录时，产物为：

| 产物 | 相对于当前目录的路径 |
| --- | --- |
| 客户端 EXE | `src-tauri\target\release\legado-reader.exe` |
| NSIS 安装包 | `src-tauri\target\release\bundle\nsis\legado-reader_<版本号>_x64-setup.exe` |

当前 NSIS 使用 `currentUser` 安装模式。版本号来自项目版本文件，可执行以下命令查看：

```powershell
(Get-Content package.json -Raw | ConvertFrom-Json).version
```

### 生成便携 ZIP

项目目前没有单独的 ZIP 打包脚本。先构建客户端 EXE，再使用 PowerShell 压缩，目录结构与桌面发布工作流一致。

```powershell
Set-Location D:\develop\Projects\legado\modules\web-reader

# 如果刚成功构建过 setup.exe，可跳过这次构建，复用同一份 EXE
pnpm tauri build --no-bundle
if ($LASTEXITCODE -ne 0) { throw '客户端构建失败，请先处理构建错误。' }

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$binaryPath = Join-Path $PWD 'src-tauri\target\release\legado-reader.exe'
$outputDir = Join-Path $PWD 'release-artifacts'
$portableDir = Join-Path $outputDir "Legado.Reader_${version}_windows-x64-portable"
$zipPath = "$portableDir.zip"

if (-not (Test-Path -LiteralPath $binaryPath -PathType Leaf)) {
    throw "未找到客户端 EXE：$binaryPath"
}
if (Test-Path -LiteralPath $portableDir) {
    throw "打包目录已存在，请先改名保留或移走，再重新打包：$portableDir"
}

New-Item -ItemType Directory -Path $portableDir -Force | Out-Null
Copy-Item -LiteralPath $binaryPath -Destination $portableDir
Compress-Archive -LiteralPath $portableDir `
    -DestinationPath $zipPath `
    -CompressionLevel Optimal -Force

Write-Host "便携 ZIP：$zipPath"
```

ZIP 输出到 `release-artifacts\Legado.Reader_<版本号>_windows-x64-portable.zip`，内部包含同名目录及 `legado-reader.exe`。压缩命令会覆盖同名 ZIP；用于压缩的目录会保留，重复打包时先将旧目录改名或移走，以免把运行产生的数据一起打包。

解压后启动 EXE。Windows 正式构建的业务数据保存在 EXE 同级的 `data` 目录中，首次运行时创建；开发模式使用 Tauri 应用数据目录，数据库文件名为 `legado_reader.dev.db`。

## 5. 本地检查

根据修改范围执行以下命令：

```powershell
# 前端单元测试
pnpm test

# 前端类型检查
pnpm exec vue-tsc --build --force

# Rust 格式检查、Clippy 与单元测试
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml

# 桌面发布流程脚本测试
node --test scripts/desktop-release.test.mjs
```

Web 与桌面前端的完整构建检查分别使用 `pnpm build:web` 和 `pnpm build:desktop-ui`。脚本测试使用临时 Git 仓库和模拟 GitHub API，不会创建远程 Release。

## 6. 桌面端正式发版

本地打包与正式发版是两个操作。`pnpm release:desktop` 同步版本、创建发布提交和标签；推送标签后，由 GitHub Actions 构建并发布附件。

### 发布前准备

- 将本次修改提交到 `main`，工作区与暂存区保持干净，未跟踪文件也需要先处理。
- `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 和 `src-tauri/Cargo.lock` 中的客户端版本保持一致。
- 新版本必须高于当前版本，且对应标签在本地与 `origin` 均不存在。
- 正式发布使用三段式稳定版本号，例如 `1.26.10090`，不使用预发布或构建元数据后缀。

```powershell
Set-Location D:\develop\Projects\legado\modules\web-reader
git branch --show-current
git status --short

# 查看自动版本更新计划，不修改文件、提交或标签
pnpm release:desktop --dry-run
```

`--dry-run` 只展示版本更新计划，不代替实际发布时的 Git 分支、工作区和远程标签检查。

### 创建发布提交与标签

```powershell
# 按 Asia/Shanghai 日期自动生成版本号
pnpm release:desktop
```

自动版本格式为 `1.YY.MDDN`：月份不补零、日期补两位、末位为当天序号。例如 2026-10-09 的首个自动版本为 `1.26.10090`，当天最多生成 10 个自动版本。

也可以显式指定版本，以下命令与自动版本命令二选一；示例版本需替换成实际要发布的新版本：

```powershell
pnpm release:desktop 1.26.10090
```

成功后会更新四个版本文件，创建发布提交与注解标签 `reader-v<版本号>`，并输出推送命令。该步骤不会自动推送，也不会在本地打包。

### 推送并触发发布

确认创建版本成功后，执行脚本输出的推送命令。也可以从当前版本文件生成标签名称：

```powershell
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
git push origin main "reader-v$version"
```

推送 `reader-v*` 标签后，[Publish Desktop Release](../../.github/workflows/build-desktop.yml) 工作流校验版本和提交，执行前端与 Linux/Windows Rust 检查，再按同一个提交构建 Windows 安装包、便携 ZIP，以及 Linux DEB、RPM、tar.gz。附件上传到草稿并校验通过后，才公开 Release。

### 手动构建与失败重试

在 GitHub Actions 中选择 `Publish Desktop Release`：

- `release_tag` 留空：检查并构建所选提交，保存 Actions 产物，不创建 Release。
- `release_tag` 填写已有完整标签（如 `reader-v1.26.10090`）：校验并构建标签对应提交，成功后发布。
- 检查或构建失败：无需改代码时可重跑失败作业；修复产生新提交时，应创建新版本与新标签。
- 附件上传失败：优先重跑失败的发布作业，复用本次运行已保存的构建产物。

已有公开 Release 不会被覆盖，标签也不会自动移动。更详细的发布恢复说明见 [桌面端构建与发布](../../.github/desktop-release.md)。

### 仅同步版本文件

如果只需要更新版本文件、不创建发布提交与标签，可以使用：

```powershell
pnpm bump --dry-run
pnpm bump
```

`pnpm bump` 会产生版本文件改动。正式发版通常直接使用 `pnpm release:desktop`；不要先执行 `pnpm bump` 再立即执行 `pnpm release:desktop`，否则工作区不干净，且发布命令还会计算下一版本。

## 7. 命令速查

| 用途 | 命令 |
| --- | --- |
| 安装依赖 | `pnpm install --frozen-lockfile` |
| Web 开发调试 | `pnpm dev:web` |
| Web 生产构建 | `pnpm build:web` |
| Web 构建产物预览 | `pnpm preview` |
| 桌面客户端调试 | `pnpm dev:desktop` |
| 只启动桌面前端 | `pnpm dev:desktop-ui` |
| 只构建桌面前端 | `pnpm build:desktop-ui` |
| Windows 安装包 | `pnpm tauri build --bundles nsis` |
| 只构建客户端 EXE | `pnpm tauri build --no-bundle` |
| 便携 ZIP | 构建 EXE 后执行第 4 节压缩命令 |
| 前端单元测试 | `pnpm test` |
| 查看发版计划 | `pnpm release:desktop --dry-run` |
| 创建发布提交与标签 | `pnpm release:desktop` |
| 触发桌面线上发布 | `git push origin main reader-v<版本号>`（替换为实际标签） |

命令依据当前 `package.json`、Tauri 配置、版本脚本与 GitHub Actions 工作流整理。端口、版本规则或工作流改变后，请同步更新本指南。
