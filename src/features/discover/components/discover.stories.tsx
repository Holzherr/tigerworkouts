import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { priyanka } from '@/features/runsheet/fixtures';
import type { Runsheet } from '@/features/runsheet/model';
import { IMPORTED } from '@/features/workouts/imported';
import { DiscoverScreen } from './discover-screen';
import { WorkoutCard } from './workout-card';
import { WorkoutPreviewScreen } from './workout-preview-screen';

const ALL: Runsheet[] = [priyanka(), ...IMPORTED.map(w => w.runsheet)];

const meta = {
  title: 'Discover/DiscoverScreen',
  component: DiscoverScreen,
  parameters: { layout: 'fullscreen', docs: { description: { component: 'Discover at phone size: title, search field, horizontally scrolling filter chips (All, Mine, Benchmarks, Programs, Videos, NHS, Protocols), then program rows in orange and workout cards with thumb, attribution and chips.' } } },
  args: { workouts: ALL, onOpen: () => {} },
  decorators: [S => <div className="mx-auto h-[820px] w-[393px] overflow-hidden border-x border-line"><S /></div>],
} satisfies Meta<typeof DiscoverScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

const Flow = () => {
  const [sel, setSel] = useState<Runsheet | null>(null);
  if (sel) return <WorkoutPreviewScreen runsheet={sel} onBack={() => setSel(null)} onStart={() => alert('start')} onEditAndStart={() => alert('edit')} onFollowAlong={() => alert('follow')} onLogOnly={() => alert('log')} onSave={() => alert('save')} history={[{ runsheetId: sel.id ?? '', startedAt: '2026-09-01T18:00:00Z', score: 312, scoreText: '5:12', steps: [] }]} />;
  return <DiscoverScreen workouts={ALL} onOpen={setSel} onOpenProgram={(_n, d) => setSel(d[0])} mineIds={new Set([priyanka().id!])} />;
};

export const All: Story = { render: () => <Flow /> };
export const Programs: Story = { args: { initialFilter: 'program' } };
export const Videos: Story = { args: { initialFilter: 'video' } };
export const Cards: Story = {
  render: () => (
    <div className="space-y-2 p-3">
      <WorkoutCard runsheet={priyanka()} onOpen={() => {}} />
      <WorkoutCard runsheet={ALL[1]} onOpen={() => {}} />
      <WorkoutCard runsheet={ALL.find(r => r.video)!} onOpen={() => {}} />
      <WorkoutCard runsheet={ALL.find(r => r.program)!} onOpen={() => {}} compact />
    </div>
  ),
};
export const Preview: Story = { render: () => <WorkoutPreviewScreen runsheet={ALL.find(r => r.title === 'Fran') ?? ALL[1]} onStart={() => {}} onEditAndStart={() => {}} onSave={() => {}} history={[{ runsheetId: 'cf-girls-fran', startedAt: '2026-08-20T18:00:00Z', score: 402, scoreText: '6:42', steps: [] }, { runsheetId: 'cf-girls-fran', startedAt: '2026-07-02T18:00:00Z', score: 455, scoreText: '7:35', steps: [] }]} /> };
