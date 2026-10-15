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
        // Serve web manifest with proper content type
        if (parsedUrl === '/manifest.webmanifest' || parsedUrl === '/manifest.json') {
          const manifestFile = parsedUrl.endsWith('.webmanifest') ? 'public/manifest.webmanifest' : 'public/manifest.json';
          const manifestPath = path.resolve(import.meta.dirname, manifestFile);
          if (fs.existsSync(manifestPath)) {
            res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
            res.setHeader('Access-Control-Allow-Origin', '*');
            return res.end(fs.readFileSync(manifestPath, 'utf-8'));
          }
        }

        // Development fallback for share-target if invoked before SW controls
        if (req.method === 'POST' && parsedUrl === '/share-target') {
          res.writeHead(303, { Location: '/?tab=library&shared=1' });
          return res.end();
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

        // Find built assets (JS and CSS) in dist/assets to precache on install
        const assetsDir = path.resolve(distDir, 'assets');
        let builtAssetPaths: string[] = [];
        if (fs.existsSync(assetsDir)) {
          const files = fs.readdirSync(assetsDir);
          builtAssetPaths = files
            .filter((f) => f.endsWith('.js') || f.endsWith('.css'))
            .map((f) => `assets/${f}`);
        }

        // Write dist/sw.js with dynamic VERSION and precached asset bundles
        if (fs.existsSync(publicSwPath)) {
          let content = fs.readFileSync(publicSwPath, 'utf-8');
          content = content.replace(
            /const VERSION = ['"].*?['"];/,
            `const VERSION = '${FULL_VERSION}';`
          );
          if (builtAssetPaths.length > 0) {
            const extraAssetsStr = builtAssetPaths.map((p) => `  '${p}',`).join('\n');
            content = content.replace(
              /const PRECACHE_ASSETS = \[\n/,
              `const PRECACHE_ASSETS = [\n${extraAssetsStr}\n`
            );
          }
          fs.writeFileSync(distSwPath, content, 'utf-8');
        }

        // Ensure manifest files are present in dist
        ['manifest.webmanifest', 'manifest.json'].forEach((filename) => {
          const src = path.resolve(import.meta.dirname, 'public', filename);
          const dest = path.resolve(distDir, filename);
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
          }
        });

        // Ensure icons directory is present in dist
        const publicIconsDir = path.resolve(import.meta.dirname, 'public/icons');
        const distIconsDir = path.resolve(distDir, 'icons');
        if (fs.existsSync(publicIconsDir)) {
          if (!fs.existsSync(distIconsDir)) {
            fs.mkdirSync(distIconsDir, { recursive: true });
          }
          fs.readdirSync(publicIconsDir).forEach((file) => {
            fs.copyFileSync(
              path.resolve(publicIconsDir, file),
              path.resolve(distIconsDir, file)
            );
          });
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
