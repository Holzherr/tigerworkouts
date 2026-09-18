import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from './button';
import { Sheet } from './sheet';

const meta = {
  title: 'Shared/UI/Sheet',
  component: Sheet,
  parameters: {
    docs: {
      description: {
        component:
          'Bottom sheet over a dimmed page: white panel with rounded top corners, grab handle, optional title row with an action slot and ✕. Body scrolls inside a fixed height. Used for the exercise picker, "Describe the workout", and settings.',
      },
    },
    layout: 'fullscreen',
  },
  args: { open: true, onOpenChange: () => {}, children: null },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

const Demo = () => {
  const [open, setOpen] = useState(true);
  return (
    <div className="h-[600px] bg-canvas p-4">
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Open sheet
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Describe the workout" action={<Button variant="text" size="inline">Paste</Button>} height="60dvh">
        <p className="text-[13px] text-muted">Any shorthand works. One line per block, or just say what to change.</p>
        <div className="mt-3 rounded-card border border-line bg-canvas p-3 font-mono text-[13px] leading-relaxed">
          kb swings 28 + incline press 20 x8 30/30
          <br />
          sprints 14.5 x8, rest 15
        </div>
      </Sheet>
    </div>
  );
};

export const Default: Story = { render: () => <Demo /> };
