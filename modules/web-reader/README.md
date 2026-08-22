# Legado Web Reader (Web 纯前端阅读器)

基于 Vue 3 + TypeScript + Vite 构建的现代化纯客户端离线小说阅读器。无需后端依赖，直接在浏览器中高速解析、排版与离线阅读 TXT / EPUB 电子书。

## ✨ 特性一览

- ⚡ **纯前端零后端**：所有文本解码、分章与样式渲染均在浏览器端进行。
- 📚 **智能 TXT 分章**：
  - 完整继承 Legado 核心正则表达式规则（`txtTocRule.json`）。
  - 支持智能书名与作者识别（`LocalBook.kt`）。
  - 自动检测字符编码（UTF-8, GBK, UTF-16），配合 `WeakMap` 缓存实现翻页秒开。
- 📖 **完善的 EPUB 支持**：
  - 兼容 EPUB 2（NCX）与 EPUB 3（Nav Document）标准目录。
  - 支持内嵌插图、SVG 图片与富文本样式渲染。
  - 封面 Base64 离线持久化与自动释放 Blob URL 内存机制。
- 💾 **IndexedDB 离线持久化**：书架元数据、图书源文件与阅读进度持久化存储。
- 🎨 **沉浸式阅读与个性化定制**：
  - 字体大小、行高、背景色与文字颜色自由调整（支持暗黑模式、羊皮纸模式等）。
  - 目录抽屉侧边栏快速跳转与快捷键（`←` / `→` 键）翻页支持。

## 🛠️ 技术栈

- **前端框架**：Vue 3 (Composition API, `<script setup>`)
- **构建工具**：Vite 8 + Rolldown
- **类型系统**：TypeScript 5
- **状态管理**：Pinia
- **组件库**：Element Plus + @element-plus/icons-vue
- **本地存储**：IndexedDB
- **解压解析**：JSZip

## 🚀 快速启动

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 类型检查与生产打包
pnpm build

# 本地预览构建产物
pnpm preview
```
