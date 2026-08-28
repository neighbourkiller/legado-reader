<div align="center">

# Legado Reader

基于 Vue 3、TypeScript 与 Tauri 2 构建的本地优先小说阅读器。

同一套 [`modules/web-reader`](./modules/web-reader) 代码同时提供纯前端 Web 阅读器和桌面客户端阅读器。

[桌面版下载](https://github.com/neighbourkiller/legado/releases) · [原 Legado 项目](https://github.com/LegadoTeam/legado)

</div>

## 两种阅读器

| 版本 | 适合场景 | 数据存储 | 主要能力 |
| :--- | :--- | :--- | :--- |
| **纯前端 Web 阅读器** | 在浏览器中直接阅读本地电子书 | 浏览器 IndexedDB | 导入 TXT / EPUB、书架与阅读进度、排版和主题设置 |
| **Tauri 桌面客户端** | 本地阅读与在线书源的一体化桌面体验 | SQLite 与应用本地文件 | 包含 Web 版能力，并增加书源、搜索、换源、离线缓存、备份恢复等功能 |

### 纯前端 Web 阅读器

Web 版无需部署后端服务，电子书解析、分章和数据保存都在浏览器本地完成，适合快速打开并长期管理本地书库。

- 支持拖放或选择多个 TXT、EPUB 文件导入。
- TXT 支持章节识别、书名与作者提取，以及 UTF-8、UTF-16、GBK、GB18030 等常见编码。
- EPUB 支持 EPUB 2 / EPUB 3 目录、富文本、内嵌图片与 SVG。
- 书架、源文件、阅读进度和排版设置通过 IndexedDB 离线保存。
- 提供滚动与分页阅读、主题、字体、字号、行距和全屏等阅读设置。

纯前端版本专注本地书籍。受浏览器跨域、Cookie 和脚本运行环境限制，不提供在线书源搜索与规则执行。

### Tauri 桌面客户端

桌面版在 Vue 阅读界面之外增加 Rust 原生能力，面向 Linux 和 Windows 提供更完整的阅读与书源工作流。

- 完整支持本地 TXT / EPUB 导入、阅读和文件管理。
- 支持 Legado 书源的导入、新建、编辑、排序、启停与调试。
- 支持在线搜索、书籍详情、加入书架、目录加载与换源。
- 使用原生 HTTP、Cookie、网页验证窗口与 QuickJS 执行书源请求和脚本。
- 支持章节与插图缓存、批量离线下载和 TXT 导出。
- 支持书签、文本高亮、标注、正文替换规则与阅读记录。
- 使用 SQLite 保存客户端数据，并保留本地电子书文件。
- 支持本地 ZIP 与 WebDAV 备份，可合并或覆盖恢复；共同数据兼容 Legado Android 备份格式。
- 提供自绘标题栏、系统字体、原生文件对话框和 F11 全屏等桌面体验。

> [!NOTE]
> 桌面端采用独立实现的书源引擎，目标是尽可能兼容 Legado Android 的常用规则语义，但不依赖 Android 运行时。涉及 Android、Rhino 或特定 WebView API 的书源可能不受支持，并不保证所有书源均可直接使用。

## 快速开始

前端开发需要 Node.js 与 pnpm。所有命令均在 `modules/web-reader` 目录执行：

```bash
cd modules/web-reader
pnpm install
```

启动或构建纯前端版本：

```bash
pnpm dev:web
pnpm build:web
pnpm preview
```

桌面端还需要 Rust 和当前系统对应的 Tauri 2 构建依赖：

```bash
pnpm dev:desktop
pnpm build:desktop
```

运行前端测试：

```bash
pnpm test
```

仓库的桌面发布流程目前生成 Linux x86_64 的 DEB、RPM、tar.gz，以及 Windows x86_64 的 MSI 和便携版 EXE，可在 [Releases](https://github.com/neighbourkiller/legado/releases) 页面下载。

## 技术栈

- 前端：Vue 3、TypeScript、Vite、Pinia、Element Plus
- 本地书解析：JSZip、浏览器文本解码与自研 TXT / EPUB 解析器
- Web 存储：IndexedDB
- 桌面端：Tauri 2、Rust、SQLite、Reqwest、QuickJS

## 主要目录

```text
modules/web-reader/
├── src/                    # Vue 前端与共享阅读逻辑
│   ├── views/              # 书架、阅读器、书源、搜索、设置等页面
│   ├── components/         # 阅读与管理界面组件
│   ├── parsers/            # TXT、EPUB 解析
│   ├── source/             # 书源规则引擎与请求传输层
│   ├── storage/            # IndexedDB / SQLite 存储适配
│   └── platform/           # Web / Tauri 平台能力抽象
└── src-tauri/              # Tauri 配置与 Rust 原生后端
```

## 与原 Legado 项目的关系

本仓库基于 [Legado（开源阅读）](https://github.com/LegadoTeam/legado) 开发，并保留原项目的 Android 客户端及相关模块。当前新增功能与维护重点是 [`modules/web-reader`](./modules/web-reader) 下的纯前端阅读器和 Tauri 桌面客户端；Android 原项目仍是书源规则、备份格式和部分阅读语义的重要兼容参考。

## 许可证

本项目遵循 [GNU General Public License v3.0](./LICENSE)。
