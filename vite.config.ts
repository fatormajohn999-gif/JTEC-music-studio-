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
    buildStart() {
      // Keep public/version.json synced with current build version
      const publicVersionPath = path.resolve(import.meta.dirname, 'public/version.json');
      try {
        fs.writeFileSync(
          publicVersionPath,
          JSON.stringify(
            {
              version: FULL_VERSION,
              built: BUILD_DATE,
            },
            null,
            2
          ),
          'utf-8'
        );
      } catch (err) {
        console.warn('[Vite] Could not write public/version.json:', err);
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const parsedUrl = req.url?.split('?')[0];
        
        // Dynamic /version.json endpoint for dev mode
        if (parsedUrl === '/version.json' || parsedUrl === './version.json') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          return res.end(
            JSON.stringify(
              {
                version: FULL_VERSION,
                built: BUILD_DATE,
              },
              null,
              2
            )
          );
        }

        // Dynamic /sw.js endpoint for dev mode
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
      // In production build, write sw.js and version.json with the build-unique version
      const distDir = path.resolve(import.meta.dirname, 'dist');
      const distSwPath = path.resolve(distDir, 'sw.js');
      const distVersionPath = path.resolve(distDir, 'version.json');
      const publicSwPath = path.resolve(import.meta.dirname, 'public/sw.js');
      
      if (fs.existsSync(distDir)) {
        // Write dist/version.json
        fs.writeFileSync(
          distVersionPath,
          JSON.stringify(
            {
              version: FULL_VERSION,
              built: BUILD_DATE,
            },
            null,
            2
          ),
          'utf-8'
        );

        // Write dist/sw.js with dynamic VERSION
        if (fs.existsSync(publicSwPath)) {
          let content = fs.readFileSync(publicSwPath, 'utf-8');
          content = content.replace(
            /const VERSION = ['"].*?['"];/,
            `const VERSION = '${FULL_VERSION}';`
          );
          fs.writeFileSync(distSwPath, content, 'utf-8');
        }
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
