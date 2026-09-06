import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppIcon } from './app-icon';

const meta = {
  title: 'Brand/AppIcon',
  component: AppIcon,
  parameters: {
    docs: {
      description: {
        component:
          'The home-screen tile. White ground, two centred coral bands at 25% each, black mark at 66% of the edge, iOS 22.5% corner radius. `square` drops the radius for maskable and store exports (the platform masks it). Tones: stripes (default), coral, white, ink. The PNGs in `public/icons/` are rendered from the same geometry.',
      },
    },
  },
  args: { size: 120 },
} satisfies Meta<typeof AppIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const HomeScreen: Story = {
  render: () => (
    <div className="flex items-end gap-6 rounded-sheet bg-[linear-gradient(160deg,#2B2E3A,#0E0F14)] p-6">
      {[120, 60, 40, 29].map(s => (
        <div key={s} className="grid justify-items-center gap-1.5">
          <AppIcon size={s} />
          <span className="text-[10px] text-white/80 tabular-nums">{s}</span>
        </div>
      ))}
    </div>
  ),
};

export const Tones: Story = {
  render: () => (
    <div className="flex items-center gap-4 p-6">
      <AppIcon size={96} tone="stripes" />
      <AppIcon size={96} tone="coral" />
      <AppIcon size={96} tone="white" />
      <AppIcon size={96} tone="ink" />
    </div>
  ),
};

export const Square: Story = {
  args: { size: 160, square: true },
};
