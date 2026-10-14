import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, Plugin } from 'vite';

const APP_BASE_VERSION = '1.0.1';
const buildTimestamp = Date.now();
const FULL_VERSION = `${APP_BASE_VERSION}.${buildTimestamp}`;
const now = new Date();
const BUILD_DATE = now.toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function pwaServiceWorkerPlugin(): Plugin {
  return {
    name: 'pwa-service-worker-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const parsedUrl = req.url?.split('?')[0];
        if (parsedUrl === '/sw.js' || parsedUrl === './sw.js') {
          const swPath = path.resolve(import.meta.dirname, 'public/sw.js');
          if (fs.existsSync(swPath)) {
            let content = fs.readFileSync(swPath, 'utf-8');
            content = content.replace(
              /const VERSION = ['"].*?['"];/,
              `const VERSION = '${FULL_VERSION}';`
            );
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return res.end(content);
          }
        }
        next();
      });
    },
    closeBundle() {
      // In production build, write sw.js with the build-unique version
      const distDir = path.resolve(import.meta.dirname, 'dist');
      const distSwPath = path.resolve(distDir, 'sw.js');
      const publicSwPath = path.resolve(import.meta.dirname, 'public/sw.js');
      
      if (fs.existsSync(distDir) && fs.existsSync(publicSwPath)) {
        let content = fs.readFileSync(publicSwPath, 'utf-8');
        content = content.replace(
          /const VERSION = ['"].*?['"];/,
          `const VERSION = '${FULL_VERSION}';`
        );
        fs.writeFileSync(distSwPath, content, 'utf-8');
      }
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      pwaServiceWorkerPlugin(),
    ],
    define: {
      __APP_VERSION__: JSON.stringify(FULL_VERSION),
      __BUILD_DATE__: JSON.stringify(BUILD_DATE),
    },
    build: {
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
