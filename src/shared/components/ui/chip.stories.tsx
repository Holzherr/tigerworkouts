import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Chip } from './chip';

const meta = {
  title: 'Shared/UI/Chip',
  component: Chip,
  parameters: {
    docs: {
      description: {
        component:
          'Rounded pill. As a <span> it labels a value (grey "value" pill such as "28 kg", orange repeat pill "×8"). As a <button> (when onClick is given) it is a quick pick in a chip group, with `on` marking the selected one. Sizes sm (24px), md (32px), lg (36px).',
      },
    },
  },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Value: Story = { args: { variant: 'value', children: '28 kg' } };

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2 p-6">
      <Chip variant="outline">outline</Chip>
      <Chip variant="value">28 kg</Chip>
      <Chip variant="on">on</Chip>
      <Chip variant="brand">×8 ▾</Chip>
      <Chip variant="brand-solid">×8</Chip>
      <Chip variant="danger">4 · Incline walk ✕</Chip>
      <Chip variant="warn">assumed</Chip>
    </div>
  ),
};

const QuickPicks = () => {
  const [v, setV] = useState(30);
  return (
    <div className="flex gap-1.5 p-6">
      {[15, 30, 45, 60, 90, 120].map(n => (
        <Chip key={n} variant={n === v ? 'on' : 'outline'} onClick={() => setV(n)}>
          {n}
        </Chip>
      ))}
    </div>
  );
};

export const ChipGroup: Story = { render: () => <QuickPicks /> };
