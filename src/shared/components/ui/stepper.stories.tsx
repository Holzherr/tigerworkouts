import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { fmtClock } from '@/shared/utils/ui-utils';
import { Stepper } from './stepper';

const meta = {
  title: 'Shared/UI/Stepper',
  component: Stepper,
  parameters: {
    docs: {
      description: {
        component:
          'Minus / value / plus in one bordered pill, 44px tall (36px small). The value is bold with no unit inside; the label beside it carries the unit ("Weight (kg per arm)"). Buttons disable at min/max.',
      },
    },
  },
  args: { value: 20, onChange: () => {} },
} satisfies Meta<typeof Stepper>;

export default meta;
type Story = StoryObj<typeof meta>;

const Live = (p: Partial<React.ComponentProps<typeof Stepper>>) => {
  const [v, setV] = useState(p.value ?? 20);
  return <Stepper {...p} value={v} onChange={setV} />;
};

export const Default: Story = { render: () => <Live value={20} step={2.5} /> };
export const Small: Story = { render: () => <Live value={30} step={5} size="sm" /> };
export const ClockFormat: Story = { render: () => <Live value={90} step={15} format={fmtClock} max={3600} /> };
export const AtMinimum: Story = { render: () => <Live value={0} min={0} /> };

export const InARow: Story = {
  render: () => (
    <div className="w-[348px] space-y-3 rounded-card bg-brand-soft p-3">
      <div className="flex items-center justify-between">
        <span className="text-[14px]">
          Weight <span className="text-muted">(kg per arm)</span>
        </span>
        <Live value={20} step={2.5} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[14px]">For</span>
        <Live value={30} step={5} />
      </div>
    </div>
  ),
};
