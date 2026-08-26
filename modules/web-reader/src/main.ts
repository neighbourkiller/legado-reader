import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import '@/assets/styles/element-theme.css'

import App from './App.vue'
import router from './router'
import { initializeStorage } from './storage/init'

async function bootstrap() {
  try {
    await initializeStorage()

    const app = createApp(App)
    app.use(createPinia())
    app.use(router)
    app.use(ElementPlus)
    app.mount('#app')
  } catch (error) {
    console.error('存储初始化失败，阻止挂载应用:', error)
    const root = document.getElementById('app')
    if (root) {
      root.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;padding:24px;box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif;background:#fff;color:#d32f2f;">
          <h2 style="margin:0 0 12px 0;">客户端存储系统初始化失败</h2>
          <p style="color:#666;max-width:600px;line-height:1.5;margin:0 0 16px 0;text-align:center;">数据库无法正常打开或迁移失败。为保护现有数据，应用已阻止启动，避免形成双库写入或数据受损。</p>
          <pre style="background:#f5f5f5;color:#333;padding:12px;border-radius:6px;overflow:auto;max-width:600px;width:100%;box-sizing:border-box;font-size:13px;border:1px solid #e0e0e0;">${String(error)}</pre>
        </div>
      `
    }
  }
}

void bootstrap()
