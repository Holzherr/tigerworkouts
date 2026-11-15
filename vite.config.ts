/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// Served from the root of tigerworkouts.com; Storybook is built separately into dist/storybook.
export default defineConfig({
  define: { __BUILD__: JSON.stringify(Date.now().toString(36)) },
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // registered by src/app/update-prompt.tsx with a per-build query so the CDN cannot serve a stale sw.js
      manifest: false, // public/manifest.webmanifest is hand-written
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // No navigateFallback: only the start URL (`/`, index.html in the precache) is answered
        // from the precache, for an instant open that updates one launch later (review D13,
        // 2026-11-15). Every other navigation, `/?r=…` from the self-heal in index.html included,
        // is network-first below. A precached shell for all navigations meant a worker that had
        // missed an update kept handing out a shell pointing at assets the deploy had replaced.
        navigateFallback: undefined,
        runtimeCaching: [
          { urlPattern: ({ request }: { request: Request }) => request.mode === 'navigate', handler: 'NetworkFirst', options: { cacheName: 'shell', networkTimeoutSeconds: 4 } },
          { urlPattern: /\/media\/.*\.(mp4|jpg)$/, handler: 'CacheFirst', options: { cacheName: 'media', expiration: { maxEntries: 200 } } },
        ],
      },
    }),
  ],
  // One chunk meant every deploy (each push to main) made a phone fetch all 480 kB again. The
  // catalogue and the libraries change far less often than the app, so they keep their hash and
  // stay cached across deploys.
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'catalogue', test: /[\\/]imports[\\/].*\.json$/ },
            { name: 'vendor-react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'vendor-supabase', test: /[\\/]node_modules[\\/]@supabase[\\/]/ },
            { name: 'vendor-ui', test: /[\\/]node_modules[\\/](@radix-ui|@floating-ui|@dnd-kit|react-remove-scroll[^\\/]*|aria-hidden|tslib)[\\/]/ },
          ],
        },
      },
    },
  },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'], include: ['src/**/*.test.@(ts|tsx)'] },
});
