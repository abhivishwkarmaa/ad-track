import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // Allow external access for subdomain testing
    // ✅ CRITICAL: Proxy API requests to backend while preserving Host header
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: false, // ✅ Preserves Host header (tenant1.localhost)
        secure: false,
        // Don't rewrite the path - keep /api as-is
      },
      // Proxy tracking endpoints to backend
      '/click': {
        target: 'http://localhost:5001',
        changeOrigin: false, // ✅ Preserves Host header
        secure: false,
      },
      '/postback': {
        target: 'http://localhost:5001',
        changeOrigin: false, // ✅ Preserves Host header
        secure: false,
      },
      '/imp': {
        target: 'http://localhost:5001',
        changeOrigin: false, // ✅ Preserves Host header
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
