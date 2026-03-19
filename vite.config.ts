import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function normalizeBase(value?: string) {
  if (!value) {
    return null
  }

  if (value === '/') {
    return '/'
  }

  return value.endsWith('/') ? value : `${value}/`
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base:
    normalizeBase(process.env.VITE_PUBLIC_BASE) ??
    (mode === 'production' ? '/argue/' : '/'),
  server: {
    proxy: {
      '/api/v1/chat/completions': {
        target: 'https://openrouter.ai',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/firebase')) {
            return 'firebase'
          }

          if (id.includes('node_modules/react')) {
            return 'react-vendor'
          }

          if (id.includes('node_modules/lucide-react')) {
            return 'icons'
          }
        },
      },
    },
  },
}))
