import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';
import { fileURLToPath, URL } from 'node:url';
// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    const isDesktop = mode === 'desktop' || process.env.VITE_APP_TARGET === 'desktop';
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
        },
        // Tauri 开发模式需要固定端口和关闭清屏
        ...(isDesktop
            ? {
                server: {
                    port: 1420,
                    strictPort: true,
                    host: '127.0.0.1',
                },
                clearScreen: false,
            }
            : {}),
    };
});
