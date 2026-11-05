import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.NAKAMA_PROXY_TARGET || 'http://127.0.0.1:7350'
  return {
    plugins: [react(), tailwindcss()],
    server: {
      // Same-origin proxy to Nakama in dev, so the browser needs no CORS setup.
      proxy: {
        '/nakama': { target, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/nakama/, '') },
      },
    },
    test: { environment: 'node' },
  }
})
