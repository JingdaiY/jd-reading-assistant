import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 固定端口：IndexedDB 按「域名 + 端口」隔离，端口一变生词本就“看不到”了。
    // strictPort: 5173 被占用时直接报错退出，而不是悄悄换成 5174。
    port: 5173,
    strictPort: true,
  },
})
