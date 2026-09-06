import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: '@storybook/react-vite',
  staticDirs: ['../public'],
  // Storybook reuses vite.config.ts; the PWA plugin must not register a service worker there.
  viteFinal: config => ({ ...config, base: './', plugins: (config.plugins ?? []).flat().filter(p => !(p && typeof p === 'object' && 'name' in p && String((p as { name: string }).name).startsWith('vite-plugin-pwa'))) }),
};

export default config;
