import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api-hf': {
        target: 'https://router.huggingface.co/hf-inference', // UPDATED ENDPOINT
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-hf/, ''),
      },
    },
  },
})