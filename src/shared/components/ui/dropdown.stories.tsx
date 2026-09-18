import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Stepper } from './stepper';
import { Dropdown } from './dropdown';

const FOR = [
  { value: 'seconds', label: 'seconds' },
  { value: 'reps', label: 'reps' },
  { value: 'minutes', label: 'minutes' },
] as const;

const meta = {
  title: 'Shared/UI/Dropdown',
  component: Dropdown,
  parameters: {
    docs: {
      description: {
        component:
          'Bordered pill showing the current choice in bold with a small caret on the right; tapping opens a compact menu below it (Radix Select). For short option sets such as units and modes. Same 44px height as Stepper so the two sit side by side.',
      },
    },
  },
  args: { value: 'seconds', options: FOR, onValueChange: () => {} },
} satisfies Meta<typeof Dropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

const Live = ({ size }: { size?: 'md' | 'sm' }) => {
  const [v, setV] = useState<(typeof FOR)[number]['value']>('seconds');
  return <Dropdown value={v} onValueChange={setV} options={FOR} size={size} aria-label="Duration unit" />;
};

export const Default: Story = { render: () => <Live /> };
export const Small: Story = { render: () => <Live size="sm" /> };

export const WithStepper: Story = {
  render: () => (
    <div className="flex w-[348px] items-center justify-between rounded-card bg-brand-soft p-3">
      <span className="text-[14px]">For</span>
      <div className="flex items-center gap-1.5">
        <Stepper value={30} step={5} onChange={() => {}} />
        <Live />
      </div>
    </div>
  ),
};
