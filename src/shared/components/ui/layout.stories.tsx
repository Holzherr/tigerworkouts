import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bookmark, Inbox, Search, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from './empty-state';
import { SegmentedControl } from './segmented-control';
import { StatTiles } from './stat-tiles';

const meta = {
  title: 'Shared/UI/Layout bits',
  component: SegmentedControl,
  parameters: { docs: { description: { component: 'Small layout bricks shared across screens: SegmentedControl (equal tabs in a grey track, white selected pill), StatTiles (row of number-over-label tiles), EmptyState (centred grey copy with optional icon and text action).' } } },
  args: { options: [], value: '', onChange: () => {} },
  decorators: [S => <div className="w-[372px] space-y-4 bg-canvas p-3"><S /></div>],
} satisfies Meta<typeof SegmentedControl>;

export default meta;
type Story = StoryObj<typeof meta>;

const Seg = () => {
  const [v, setV] = useState<'saved' | 'foryou' | 'search'>('foryou');
  return <SegmentedControl value={v} onChange={setV} options={[{ id: 'saved', label: 'Saved', icon: <Bookmark /> }, { id: 'foryou', label: 'For you', icon: <Sparkles /> }, { id: 'search', label: 'Search', icon: <Search /> }]} />;
};

export const Segmented: Story = { render: () => <Seg /> };
export const Stats: Story = { render: () => <StatTiles stats={[{ value: '472+', label: 'workouts' }, { value: '349+', label: 'exercises' }, { value: '£0', label: 'forever' }]} /> };
export const StatsClickable: Story = { render: () => <StatTiles stats={[{ value: 6, label: 'sessions', onClick: () => alert('sessions') }, { value: 3, label: 'this week', onClick: () => alert('week') }, { value: 420, label: 'minutes', onClick: () => alert('minutes') }]} /> };
export const Empty: Story = { render: () => <EmptyState icon={<Inbox />} title="Nothing saved yet" body="Tap Save on any workout, or Save as mine after editing one." action={{ label: 'Browse workouts', onClick: () => alert('browse') }} /> };
