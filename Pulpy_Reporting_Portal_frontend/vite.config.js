import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // Allow external access for subdomain testing
    // 🔒 STRICT SUBDOMAIN-BASED MULTI-TENANCY
    // ✅ CRITICAL: Proxy API requests to backend while preserving Host header
    // changeOrigin: false ensures the original Host header (with tenant subdomain) is forwarded
    // This allows backend to resolve tenant from subdomain (e.g., tenant1.localhost:5173)
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: false, // ✅ Preserves Host header (tenant1.localhost) - REQUIRED for tenant resolution
        secure: false,
        // Don't rewrite the path - keep /api as-is
      },
      // Proxy tracking endpoints to backend
      '/click': {
        target: 'http://localhost:5001',
        changeOrigin: false, // ✅ Preserves Host header
        secure: false,
      },
      '/event': {
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
