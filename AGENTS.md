# Repository Guidelines

## 当前开发重点

本项目目前重点开发 `modules/web-reader` 下的 **Tauri 2 + Vue 3 客户端**。纯前端 Web 客户端已经开发完毕；除非修复回归问题或调整共用逻辑，否则新增功能、架构设计和兼容性工作应优先面向 Tauri 客户端。

## 重要目录

- `modules/web-reader/src/`：Vue 3 前端主代码，包括界面、状态管理、路由和业务逻辑。
- `modules/web-reader/src/views/`：页面级组件；`components/` 存放可复用 UI 组件。
- `modules/web-reader/src/stores/`：Pinia 状态；`router/` 负责页面路由。
- `modules/web-reader/src/source/`：书源核心功能，其中 `engine/`、`transport/` 和 `types/` 分别负责规则执行、请求传输和类型定义。
- `modules/web-reader/src/platform/`：Web 与 Tauri 的平台能力适配。跨平台调用应通过此处抽象，避免在页面中直接耦合运行环境。
- `modules/web-reader/src/parsers/`：TXT、EPUB 等文件解析；`storage/` 负责本地数据持久化。
- `modules/web-reader/src/assets/`：字体、图片和全局样式等前端资源。
- `modules/web-reader/src-tauri/src/`：Tauri 2 的 Rust 后端，包含原生命令、书源 HTTP 请求、Cookie 管理和安全策略。
- `modules/web-reader/src-tauri/capabilities/`：Tauri 权限声明；`tauri.conf.json` 和 `Cargo.toml` 分别管理应用配置与 Rust 依赖。
- `app/`、`modules/web/`、`modules/book/`、`modules/rhino/`：原 Android、Web 管理端及共享模块，不是当前开发重心；仅在明确需要兼容或复用时修改。

## 智能体要求

智能体必须使用中文与用户沟通，包括进度更新、分析说明、提问和最终回复。
