import type { Preview } from '@storybook/react-vite';
import '../src/styles/tailwind.css';

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: { test: 'todo' },
    backgrounds: { options: { app: { name: 'app', value: '#f8fafc' }, white: { name: 'white', value: '#ffffff' } } },
    viewport: {
      options: {
        iphone: { name: 'iPhone 15', styles: { width: '393px', height: '852px' }, type: 'mobile' },
        desktop: { name: 'Desktop', styles: { width: '1200px', height: '800px' }, type: 'desktop' },
      },
    },
  },
  initialGlobals: { backgrounds: { value: 'app' } },
};

export default preview;
