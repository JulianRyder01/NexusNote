import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// 仓库位于 /sdcard（FUSE，noexec）。真实源码在仓库内，而运行镜像在 /home。
// 软链会让 vite 解析到源文件的真实路径，因此需要 preserveSymlinks 与 fs.allow。
const here = dirname(fileURLToPath(import.meta.url))
const runDir = process.env.APLUSNEXUS_RUN_DIR ?? '/home/julian/AplusNexusRun'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // 让 vite 以「仓库内的源文件」为准解析依赖，而非软链后的真实路径
    preserveSymlinks: true,
    alias: {
      '@': resolve(here, 'src'),
      '@shared': resolve(here, 'shared'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    fs: {
      allow: [here, runDir],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
})
