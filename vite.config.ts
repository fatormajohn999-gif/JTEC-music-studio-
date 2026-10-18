import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'fs';
import path from 'path';

// Custom plugin to serve /sw.js cleanly during dev mode without Vite module transform errors
function serveServiceWorkerDevPlugin() {
  return {
    name: 'serve-sw-dev',
    apply: 'serve' as const,
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const rawUrl = req.url || '';
        const cleanUrl = rawUrl.split('?')[0];
        if (cleanUrl === '/sw.js' || cleanUrl === './sw.js') {
          const swPath = path.resolve(__dirname, 'public/sw.js');
          if (fs.existsSync(swPath)) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            res.setHeader('Service-Worker-Allowed', '/');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            const content = fs.readFileSync(swPath, 'utf-8');
            res.end(content);
            return;
          }
        }
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    serveServiceWorkerDevPlugin(),
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  define: {
    __APP_VERSION__: JSON.stringify('1.0.1'),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
});
