import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve, extname } from 'path';

// Le back-office est une SPA montée sur /admin (voir src/admin/router.js,
// createWebHistory('/admin/')). Vite ne sert que des fichiers .html statiques,
// donc /admin, /admin/events, /admin/plans/:id, etc. doivent être réécrits
// vers admin.html pour que le rechargement/deep-link fonctionne.
function adminHistoryFallback() {
  function rewrite(req, _res, next) {
    const [pathname, query = ''] = req.url.split('?');
    if ((pathname === '/admin' || pathname.startsWith('/admin/')) && !extname(pathname)) {
      req.url = '/admin.html' + (query ? '?' + query : '');
    }
    next();
  }
  return {
    name: 'admin-history-fallback',
    configureServer(server) { server.middlewares.use(rewrite); },
    configurePreviewServer(server) { server.middlewares.use(rewrite); },
  };
}

export default defineConfig({
  base: '/',
  plugins: [vue(), adminHistoryFallback()],
  server: {
    port: 5173,
    https: {
      key: './certs/localhost-key.pem',
      cert: './certs/localhost.pem',
    },
    proxy: {
      '/api/admin/events': {
        target: 'https://localhost:8000',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['cache-control'] = 'no-cache';
            proxyRes.headers['x-accel-buffering'] = 'no';
          });
        },
      },
      '/api': {
        target: 'https://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      '/.well-known/mercure': {
        target: 'http://127.0.0.1:3010',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, req, res) => {
            // Désactiver tout buffering pour SSE
            res.setHeader('X-Accel-Buffering', 'no');
            res.setHeader('Cache-Control', 'no-cache');
            proxyRes.headers['x-accel-buffering'] = 'no';
            proxyRes.headers['cache-control'] = 'no-cache';
          });
        },
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        widget: resolve(__dirname, 'widget.html'),
        embedEditor: resolve(__dirname, 'embed-editor.html'),
      },
    },
  },
});
