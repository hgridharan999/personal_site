import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import apiDevServer from './vite.api-dev.js'

export default defineConfig({
  plugins: [react(), apiDevServer()],
  assetsInclude: ['**/*.md'],
  define: {
    'global': 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
})
