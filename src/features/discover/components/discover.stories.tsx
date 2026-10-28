import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { EX, priyanka } from '@/features/runsheet/fixtures';
import { makeExercise, type Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import { IMPORTED } from '@/features/workouts/imported';
import { DiscoverScreen } from './discover-screen';
import { WorkoutCard } from './workout-card';
import { WorkoutPreviewScreen } from './workout-preview-screen';
import { myAssignmentsFixture } from '@/features/coaching/fixtures';

const ALL: Runsheet[] = [priyanka(), ...IMPORTED.map(w => w.runsheet)];
const HISTORY: SessionResult[] = [
  { runsheetId: 'prog-stronglifts-5x5-workout-a', startedAt: '2026-09-05T18:00:00Z', steps: [] },
  { runsheetId: 'cf-girls-fran', startedAt: '2026-09-03T18:00:00Z', score: 402, scoreText: '6:42', steps: [] },
  { runsheetId: priyanka().id!, startedAt: '2026-09-01T18:00:00Z', steps: [] },
].filter(h => ALL.some(r => (r.id ?? r.title) === h.runsheetId));
const SAVED = ['cf-girls-cindy', 'nhs-c25k-w1', ALL.find(r => r.video)?.id ?? ''].filter(Boolean);
/** Four creators, no exercise in common: after one session of Priyanka's circuit the ranking has nothing to go on. */
const FEW: Runsheet[] = [
  priyanka(),
  { id: 'cf-girls-fran', title: 'Fran', source: { title: 'Fran', author: 'CrossFit', kind: 'benchmark' }, items: [makeExercise(EX.db_thruster, { forMode: 'reps', forValue: 21 }), makeExercise(EX.bw_pullup, { forMode: 'reps', forValue: 21 })] },
  { id: 'vid-burpees', title: 'Burpee blast', source: { title: 'Burpee blast', author: 'Sam Fixture', kind: 'video' }, items: [makeExercise(EX.bw_burpee, { forMode: 'minutes', forValue: 8 })] },
  { id: 'prog-lift-day-1', title: 'Day 1', program: { name: 'Lift', day: 'Day 1', order: 1 }, source: { title: 'Lift', author: 'Fixture Barbell Club', kind: 'program' }, items: [makeExercise(EX.bb_back_squat, { forMode: 'reps', forValue: 5 })] },
];

const meta = {
  title: 'Discover/DiscoverScreen',
  component: DiscoverScreen,
  parameters: { layout: 'fullscreen', docs: { description: { component: 'Home at phone size, plain (17 Oct 2026): large Workouts title with a round +, the search field, then Mine | Discover pills. Mine lists what a coach sent, then own and saved workouts, each a card with a coral play. Discover shows kind chips, the For you picks under their reasons, then the catalogue with programs as one row each. A query lists matches only.' } } },
  args: { workouts: ALL, ownIds: [priyanka().id!], onOpen: () => {}, onStart: () => {}, onCreate: () => {} },
  decorators: [S => <div className="mx-auto h-[820px] w-[393px] overflow-hidden border-x border-line"><S /></div>],
} satisfies Meta<typeof DiscoverScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

const Flow = () => {
  const [sel, setSel] = useState<Runsheet | null>(null);
  if (sel) return <WorkoutPreviewScreen runsheet={sel} onBack={() => setSel(null)} onStart={() => alert('start')} onEditAndStart={() => alert('edit')} onFollowAlong={() => alert('follow')} onLogOnly={() => alert('log')} onSave={() => alert('save')} history={HISTORY.filter(h => h.runsheetId === sel.id)} />;
  return <DiscoverScreen workouts={ALL} results={HISTORY} savedIds={SAVED} ownIds={[priyanka().id!]} onOpen={setSel} onStart={r => alert(`start ${r.title}`)} onOpenProgram={(_n, d) => setSel(d[0])} onCreate={() => alert('create')} />;
};

const FROM_COACH = myAssignmentsFixture().flatMap(a => (a.workout ? [{ id: a.id, runsheet: a.workout, coachName: a.coachName, done: a.id === 'a1' }] : []));

export const Mine: Story = { render: () => <Flow /> };
export const MineFromCoach: Story = { args: { results: HISTORY, savedIds: SAVED, fromCoach: FROM_COACH } };
export const MineEmpty: Story = { args: { savedIds: [], ownIds: [], workouts: IMPORTED.map(w => w.runsheet) } };
export const Discover: Story = { args: { initialTab: 'discover', results: HISTORY, savedIds: SAVED } };
export const DiscoverColdStart: Story = { args: { initialTab: 'discover', results: [], savedIds: [] } };
export const DiscoverNothingToSuggest: Story = { args: { initialTab: 'discover', workouts: FEW, results: [{ runsheetId: priyanka().id!, startedAt: '2026-09-25T18:00:00Z', steps: [] }], savedIds: [] } };
export const DiscoverPrograms: Story = { args: { initialTab: 'discover', initialFilter: 'program' } };
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

/** Nick's Mine on 18 Oct: a workout the AI coach just made pinned on top as Up next, its why under the title, then the two done. */
const MADE_FOR_YOU: Runsheet = {
  ...priyanka(),
  id: 'u-rows-lunges',
  title: 'Rows, lunges, rower sprints & abs',
  creator: 'AI Coach',
  level: 'Medium',
  description: 'Pull, legs and abs to balance the swings / incline press / sprints session. Same 30 on / 30 off rhythm.',
  createdAt: '2026-10-18T07:46:00Z',
  source: { title: 'Rows, lunges, rower sprints & abs', author: 'AI Coach', kind: 'user' },
};
export const MineNewMadeForYou: Story = {
  args: {
    workouts: [MADE_FOR_YOU, priyanka(), ...IMPORTED.map(w => w.runsheet)],
    ownIds: [priyanka().id!, MADE_FOR_YOU.id!],
    savedIds: ['cf-girls-fran'],
    results: [
      { runsheetId: priyanka().id!, startedAt: '2026-10-12T18:00:00Z', steps: [] },
      { runsheetId: 'cf-girls-fran', startedAt: '2026-09-27T18:00:00Z', score: 402, scoreText: '6:42', steps: [] },
    ],
  },
};

/** Nick's Mine on 27 Oct: four workouts, all done, so Up next is the one done longest ago, on top; the rest newest first. */
export const MineAllDone: Story = {
  args: {
    workouts: [MADE_FOR_YOU, priyanka(), ...IMPORTED.map(w => w.runsheet)],
    ownIds: [priyanka().id!, MADE_FOR_YOU.id!],
    savedIds: ['cf-girls-fran', 'cf-girls-cindy'],
    results: [[MADE_FOR_YOU.id!, 26], ['cf-girls-cindy', 25], ['cf-girls-fran', 24], [priyanka().id!, 22]].map(([runsheetId, day]) => ({ runsheetId: `${runsheetId}`, startedAt: `2026-10-${day}T18:00:00Z`, steps: [] })),
  },
};
