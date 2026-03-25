import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'window',
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      buffer: 'buffer',
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:1970',
        changeOrigin: true,
      },
      '/music': {
        target: 'http://localhost:1970',
        changeOrigin: true,
      },
    }
  }
})
