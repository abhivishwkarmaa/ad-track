import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))
/** CI: set VITE_APP_RELEASE to git SHA so each deploy bumps client migration + storage cleanup */
const appRelease = process.env.VITE_APP_RELEASE || pkg.version || '0.0.0'

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_RELEASE__: JSON.stringify(appRelease),
  },
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: false,
        secure: false,
      },
      '/click': {
        target: 'http://localhost:5001',
        changeOrigin: false,
        secure: false,
      },
      '/event': {
        target: 'http://localhost:5001',
        changeOrigin: false, // ✅ Preserves Host header
        secure: false,
      },
      '/postback': {
        target: 'http://localhost:5001',
        changeOrigin: false,
        secure: false,
      },
      '/imp': {
        target: 'http://localhost:5001',
        changeOrigin: false,
        secure: false,
      },
      '/health': {
        target: 'http://localhost:5001',
        changeOrigin: false,
        secure: false,
      },
    },
  },
})
