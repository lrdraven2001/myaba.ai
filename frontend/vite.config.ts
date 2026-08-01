import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split large, rarely-changing vendors into their own cacheable chunks so
        // they load in parallel with app code and survive app-code redeploys.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase') || id.includes('@firebase')) return 'firebase'
            if (id.includes('@fortawesome')) return 'fontawesome'
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:9090',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
