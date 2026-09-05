import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flame, History, User } from 'lucide-react';
import { useState } from 'react';
import { TabBar } from './tab-bar';

const TABS = [
  { id: 'discover', label: 'Discover', icon: <Flame /> },
  { id: 'history', label: 'History', icon: <History /> },
  { id: 'me', label: 'Me', icon: <User /> },
] as const;

const meta = {
  title: 'Shared/UI/TabBar',
  component: TabBar,
  parameters: {
    docs: { description: { component: 'Bottom navigation bar: equal columns, icon above an 11px label, active tab in brand orange, solid white with a top hairline. 56px tall plus the home-indicator inset.' } },
  },
  args: { items: TABS, active: 'discover', onSelect: () => {} },
} satisfies Meta<typeof TabBar>;

export default meta;
type Story = StoryObj<typeof meta>;

const Live = () => {
  const [a, setA] = useState<(typeof TABS)[number]['id']>('discover');
  return (
    <div className="w-[393px] border border-line">
      <TabBar items={TABS} active={a} onSelect={setA} />
    </div>
  );
};

export const Default: Story = { render: () => <Live /> };
