[![icon_android](https://github.com/gedoor/gedoor.github.io/blob/master/static/img/legado/icon_android.png)](https://play.google.com/store/apps/details?id=io.legado.play.release)
<a href="https://jb.gg/OpenSourceSupport" target="_blank">
<img width="24" height="24" src="https://resources.jetbrains.com/storage/products/company/brand/logos/jb_beam.svg?_gl=1*135yekd*_ga*OTY4Mjg4NDYzLjE2Mzk0NTE3MzQ.*_ga_9J976DJZ68*MTY2OTE2MzM5Ny4xMy4wLjE2NjkxNjMzOTcuNjAuMC4w&_ga=2.257292110.451256242.1669085120-968288463.1639451734" alt="idea"/>
</a>

<div align="center">

# Legado (开源阅读)

Legado 是一款免费、开源、功能强大的小说阅读平台，包含 Android 客户端与现代化的 Web 纯前端阅读器。

</div>

---

## 📦 项目模块介绍

| 模块 | 目录 | 说明 | 技术栈 |
| :--- | :--- | :--- | :--- |
| **Android App** | [`app/`](./app) | Legado Android 原生阅读器客户端 | Kotlin, Android SDK, Coroutines |
| **Web Reader** | [`modules/web-reader/`](./modules/web-reader) | **纯前端离线小说阅读器（重点推荐）** | Vue 3, Vite, TypeScript, Pinia, Element Plus |
| **Web Admin** | [`modules/web/`](./modules/web) | Legado Web 端管理与书源编辑后台（需配合 App 服务） | Vue 3, Webpack |

---

## 📖 Web Reader 前端阅读器 (`modules/web-reader`)

`modules/web-reader` 是基于现代前端技术栈构建的**纯客户端小说阅读器**，无需搭建任何后端服务，直接在浏览器中解析并阅读本地电子书。

### ✨ 核心特性

- **纯前端零后端运行**：完全基于浏览器端解析，保护用户隐私，打开即用。
- **TXT 智能分章解析**：
  - 完整移植自 Legado Android 原生 [`txtTocRule.json`](./modules/web-reader/src/parsers/txt-parser.ts) 的目录提取正则表达式，支持绝大多数中文网络小说目录结构。
  - 支持书名与作者智能识别（移植自 `LocalBook.kt`）。
  - 内置字符编码自动识别（UTF-8, UTF-16, GBK, GB2312, GB18030）与 `WeakMap` 高性能解码缓存。
- **EPUB 全功能解析**：
  - 支持 EPUB 2（NCX）与 EPUB 3（Nav Document）标准目录提取。
  - 支持章内内嵌插图、SVG 图片与多样式渲染。
  - 封面 Base64 持久化与 Blob URL 严格生命周期管理，避免大长篇内存泄漏。
- **本地存储与离线持久化**：
  - 基于浏览器 **IndexedDB**（`legado-web-reader`）持久化存储书架数据、书籍元信息与阅读进度。
  - 下次打开自动恢复上次阅读位置与排版偏好。

