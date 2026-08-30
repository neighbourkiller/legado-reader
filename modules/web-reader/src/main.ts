import { runSourceAuditCliIfRequested } from '@/source/audit/SourceAuditBootstrap'
import { clearDevModuleRecovery, recoverTransientDevModuleFailure } from '@/utils/devModuleRecovery'

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function renderStartupFailure(title: string, description: string, error: unknown) {
  const root = document.getElementById('app')
  if (!root) return
  root.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;padding:24px;box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif;background:#fff;color:#d32f2f;">
      <h2 style="margin:0 0 12px 0;">${escapeHtml(title)}</h2>
      <p style="color:#666;max-width:600px;line-height:1.5;margin:0 0 16px 0;text-align:center;">${escapeHtml(description)}</p>
      <pre style="background:#f5f5f5;color:#333;padding:12px;border-radius:6px;overflow:auto;max-width:600px;width:100%;box-sizing:border-box;font-size:13px;border:1px solid #e0e0e0;">${escapeHtml(error)}</pre>
    </div>
  `
}

async function bootstrap() {
  try {
    if (await runSourceAuditCliIfRequested()) return
  } catch (error) {
    console.error('检测客户端启动模式失败:', error)
    renderStartupFailure(
      '客户端启动失败',
      '无法确认当前启动模式。若这是自动书源审计，后端看门狗会写入错误报告并自动结束进程。',
      error,
    )
    return
  }

  try {
    const { initializeStorage } = await import('./storage/init')
    await initializeStorage()
  } catch (error) {
    console.error('存储初始化失败，阻止挂载应用:', error)
    renderStartupFailure(
      '客户端存储系统初始化失败',
      '数据库无法正常打开或迁移失败。为保护现有数据，应用已阻止启动，避免形成双库写入或数据受损。',
      error,
    )
    return
  }

  try {
    const [vue, pinia, elementPlus, { default: App }, { default: router }] = await Promise.all([
      import('vue'),
      import('pinia'),
      import('element-plus'),
      import('./App.vue'),
      import('./router'),
      import('element-plus/dist/index.css'),
      import('element-plus/theme-chalk/dark/css-vars.css'),
      import('@/assets/styles/element-theme.css'),
      import('@/assets/styles/typography.css'),
    ])
    const app = vue.createApp(App)
    app.use(pinia.createPinia())
    app.use(router)
    app.use(elementPlus.default)
    app.mount('#app')
  } catch (error) {
    console.error('客户端界面模块加载失败:', error)
    if (recoverTransientDevModuleFailure(error)) return
    renderStartupFailure(
      '客户端界面加载失败',
      '前端模块未能加载。开发环境请确认对应的 Vite 服务仍在运行；正式客户端请重新启动后检查安装资源。',
      error,
    )
    return
  }
  clearDevModuleRecovery()
}

void bootstrap()
