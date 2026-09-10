import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      {
        name: 'iap-me-endpoint',
        configureServer(server) {
          server.middlewares.use('/api/me', (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            const incomingHeader = (req.headers['x-goog-authenticated-user-email'] as string) || '';
            const cleanHeader = incomingHeader.replace(/^accounts\.google\.com:/, '').trim();
            const email = cleanHeader || env.VITE_SSO_USER_EMAIL || env.SSO_USER_EMAIL || 'demo.user@google.com';
            res.end(JSON.stringify({
              email,
              raw: incomingHeader,
            }));
          });
        },
      },
    ],
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
        '/api/mcp-dev': {
          target: 'https://bap.api.maloosatyam.demo.altostrat.com/mcp',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/mcp-dev/, ''),
          secure: false,
        },
        '/api/mcp-prod': {
          target: 'https://api.maloosatyam.demo.altostrat.com/mcp',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/mcp-prod/, ''),
          secure: false,
        },
      },
    },
  };
});
