import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { fileURLToPath, URL } from 'node:url'

// 每次构建生成唯一版本号，写进 <meta name="xjk-build">。
// Service Worker 用它判断「用户当前跑的页面是不是已经是最新版」，
// 避免刷新后仍误报「发现新版本」。
const buildId = `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}-${Math.random()
  .toString(36)
  .slice(2, 8)}`

function injectBuildId(): Plugin {
  return {
    name: 'xjk-build-id',
    transformIndexHtml(html) {
      return html.replace(/__XJK_BUILD_ID__/g, buildId)
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), injectBuildId(), viteSingleFile()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { host: true, port: 5173 },
  build: {
    // 单文件构建：将 JS/CSS 全部内联进 index.html
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    minify: 'esbuild',
  },
})
