/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// Served from GitHub Pages under the repo path; Storybook is built separately into dist/storybook.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/nick-prototypes/workout-hub-next/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // public/manifest.webmanifest is hand-written
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], runtimeCaching: [{ urlPattern: /\/media\/.*\.(mp4|jpg)$/, handler: 'CacheFirst', options: { cacheName: 'media', expiration: { maxEntries: 200 } } }], navigateFallbackDenylist: [/^\/legacy/, /^\/storybook/] },
    }),
  ],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'], include: ['src/**/*.test.@(ts|tsx)'] },
});
