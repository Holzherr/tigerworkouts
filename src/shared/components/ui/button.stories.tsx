import type { Meta, StoryObj } from '@storybook/react-vite';
import { Play, Plus, X } from 'lucide-react';
import { Button } from './button';

const meta = {
  title: 'Shared/UI/Button',
  component: Button,
  parameters: {
    docs: {
      description: {
        component:
          'Rounded 44px-high tap target. Variants: brand (orange fill, the one primary action per screen), ghost (white with border), soft (light grey fill), dark (ink fill), and three text-only variants: text (orange), danger (red), quiet (grey). Sizes: default, sm, lg, icon, icon-sm, inline. `block` stretches to the container width.',
      },
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { variant: 'brand', children: 'Start · 23 min' },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3 p-6">
      <Button variant="brand">
        <Play /> Start
      </Button>
      <Button variant="ghost">Save as mine</Button>
      <Button variant="soft">Reset</Button>
      <Button variant="dark">Undo</Button>
      <Button variant="text">Paste plan</Button>
      <Button variant="danger">Remove</Button>
      <Button variant="quiet">Cancel</Button>
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3 p-6">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon" variant="ghost" aria-label="Add">
        <Plus />
      </Button>
      <Button size="icon-sm" variant="quiet" aria-label="Remove">
        <X />
      </Button>
      <Button size="inline" variant="text">
        tap name to change ›
      </Button>
    </div>
  ),
};

export const PinnedBar: Story = {
  render: () => (
    <div className="flex w-[360px] gap-2 border-t border-line bg-surface p-3">
      <Button block>
        <Play /> Start · 23 min
      </Button>
      <Button variant="ghost">Save as mine</Button>
    </div>
  ),
};
