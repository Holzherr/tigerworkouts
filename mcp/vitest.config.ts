import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, '../src'), 'cloudflare:workers': path.resolve(import.meta.dirname, 'test/stubs/cloudflare-workers.ts') } },
  test: { include: ['test/**/*.test.ts'], environment: 'node', server: { deps: { inline: ['@cloudflare/workers-oauth-provider'] } } },
});
