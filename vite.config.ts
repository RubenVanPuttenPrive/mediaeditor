import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const base = '/mediaeditor/';

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0') },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'icons/*.svg', 'stickers/*.svg'],
      manifest: {
        name: 'MediaEditor',
        short_name: 'MediaEditor',
        description: 'Edit videos in your browser. Your videos never leave your device.',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#111318',
        theme_color: '#111318',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell, JS chunks (including the lazy encoder), fonts, stickers, emoji index.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,json,webmanifest}'],
        globIgnores: ['emoji/svg/**', 'emoji/index-*.json', 'ffmpeg/**', 'music/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: base + 'index.html',
        runtimeCaching: [
          {
            // Emoji images and search indexes, bundled music and the ffmpeg fallback core: cached on first use.
            urlPattern: ({ url }) => /\/(emoji\/svg\/|emoji\/index-|ffmpeg\/|music\/)/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'lazy-assets',
              expiration: { maxEntries: 3000 },
              rangeRequests: true,
            },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
