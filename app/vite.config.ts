import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
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
