import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api/vertexai-dev': {
        target: 'https://bap.api.maloosatyam.demo.altostrat.com/vertexai/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/vertexai-dev/, ''),
        secure: false,
      },
      '/api/vertexai-prod': {
        target: 'https://api.maloosatyam.demo.altostrat.com/vertexai/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/vertexai-prod/, ''),
        secure: false,
      },
    },
  },
})
