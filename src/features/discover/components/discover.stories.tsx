import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { priyanka } from '@/features/runsheet/fixtures';
import type { Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import { IMPORTED } from '@/features/workouts/imported';
import { DiscoverScreen } from './discover-screen';
import { WorkoutCard } from './workout-card';
import { WorkoutPreviewScreen } from './workout-preview-screen';

const ALL: Runsheet[] = [priyanka(), ...IMPORTED.map(w => w.runsheet)];
const HISTORY: SessionResult[] = [
  { runsheetId: 'prog-stronglifts-5x5-workout-a', startedAt: '2026-09-05T18:00:00Z', steps: [] },
  { runsheetId: 'cf-girls-fran', startedAt: '2026-09-03T18:00:00Z', score: 402, scoreText: '6:42', steps: [] },
  { runsheetId: priyanka().id!, startedAt: '2026-09-01T18:00:00Z', steps: [] },
].filter(h => ALL.some(r => (r.id ?? r.title) === h.runsheetId));
const SAVED = ['cf-girls-cindy', 'nhs-c25k-w1', ALL.find(r => r.video)?.id ?? ''].filter(Boolean);

const meta = {
  title: 'Discover/DiscoverScreen',
  component: DiscoverScreen,
  parameters: { layout: 'fullscreen', docs: { description: { component: 'Home feed at phone size: title, a three-way segmented control (Saved / For you / Search). Saved lists bookmarked and own workouts. For you lists ranked recommendations with an orange reason line above each card. Search puts the field first; empty query shows filter chips and the catalogue with programs as orange rows, a query shows matches only.' } } },
  args: { workouts: ALL, onOpen: () => {}, onCreate: () => {} },
  decorators: [S => <div className="mx-auto h-[820px] w-[393px] overflow-hidden border-x border-line"><S /></div>],
} satisfies Meta<typeof DiscoverScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

const Flow = () => {
  const [sel, setSel] = useState<Runsheet | null>(null);
  if (sel) return <WorkoutPreviewScreen runsheet={sel} onBack={() => setSel(null)} onStart={() => alert('start')} onEditAndStart={() => alert('edit')} onFollowAlong={() => alert('follow')} onLogOnly={() => alert('log')} onSave={() => alert('save')} history={HISTORY.filter(h => h.runsheetId === sel.id)} />;
  return <DiscoverScreen workouts={ALL} results={HISTORY} savedIds={SAVED} onOpen={setSel} onOpenProgram={(_n, d) => setSel(d[0])} onCreate={() => alert('create')} />;
};

export const ForYou: Story = { render: () => <Flow /> };
export const ForYouColdStart: Story = { args: { results: [], savedIds: [] } };
export const Saved: Story = { args: { initialTab: 'saved', savedIds: SAVED } };
export const SavedEmpty: Story = { args: { initialTab: 'saved', savedIds: [], workouts: IMPORTED.map(w => w.runsheet) } };
export const SearchBrowse: Story = { args: { initialTab: 'search' } };
export const SearchPrograms: Story = { args: { initialTab: 'search', initialFilter: 'program' } };
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
