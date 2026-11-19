/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// A single `.env` file lives one directory above `frontend/` (the repository root
// after integration). Only variables prefixed with `VITE_` are ever exposed to
// browser code, so backend settings such as DB_PASSWORD stay private.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', 'VITE_')
  const apiProxyTarget = env.VITE_DEV_API_PROXY_TARGET || 'http://localhost:8080'

  return {
    plugins: [react(), tailwindcss()],
    envDir: '..',
    server: {
      port: 5173,
      strictPort: true,
      // Dev-only: forwards same-origin /api calls to the backend, so no CORS is needed locally.
      proxy: { '/api': { target: apiProxyTarget, changeOrigin: true } },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test-setup.ts'],
      css: false,
    },
  }
})
