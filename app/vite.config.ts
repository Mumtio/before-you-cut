import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The front end only ever talks to our own backend, which is the only place the
// API key exists. Nothing here needs to know it.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
