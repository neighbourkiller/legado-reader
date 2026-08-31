import { defineConfig, searchForWorkspaceRoot } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isDesktop = mode === 'desktop' || process.env.VITE_APP_TARGET === 'desktop'
  const isSourceAudit = process.env.LEGADO_SOURCE_AUDIT === '1'

  return {
    plugins: [
      vue(),
      AutoImport({
        resolvers: [ElementPlusResolver()],
      }),
      Components({
        resolvers: [ElementPlusResolver()],
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
      extensions: ['.ts', '.tsx', '.mjs', '.js', '.mts', '.jsx', '.json'],
    },
    build: {
      // Web 产物需要 manifest 来核验首屏静态依赖中没有混入 Tauri IPC。
      manifest: !isDesktop,
    },
    // Tauri 开发模式需要固定端口和关闭清屏
    ...(isDesktop
      ? {
          server: {
            port: isSourceAudit ? 1421 : 1420,
            strictPort: true,
            host: '127.0.0.1',
            hmr: isSourceAudit ? false : undefined,
            watch: isSourceAudit ? null : undefined,
            fs: {
              allow: [
                searchForWorkspaceRoot(process.cwd()),
                fileURLToPath(new URL('../../testdata', import.meta.url)),
              ],
            },
          },
          clearScreen: false,
        }
      : {}),
  }
})
