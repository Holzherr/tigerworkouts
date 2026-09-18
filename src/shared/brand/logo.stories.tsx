import type { Meta, StoryObj } from '@storybook/react-vite';
import { Logo } from './logo';

const meta = {
  title: 'Brand/Logo',
  component: Logo,
  parameters: {
    docs: {
      description: {
        component:
          'Lockup for headers and sign-in screens: mark, then "TigerWorkouts" as one word with "Workouts" in coral. Sizes sm (tab bars, 17px), md (screen headers, 22px), lg (sign-in, 34px). `tone="white"` for dark grounds; the coral stays. `markOnly` for tight spots.',
      },
    },
  },
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sizes: Story = {
  render: () => (
    <div className="grid gap-5 p-6">
      <Logo size="sm" />
      <Logo size="md" />
      <Logo size="lg" />
    </div>
  ),
};

export const OnInk: Story = {
  render: () => (
    <div className="grid gap-5 rounded-card bg-ink-pure p-6">
      <Logo size="md" tone="white" />
      <Logo size="md" tone="white" markOnly />
    </div>
  ),
};
