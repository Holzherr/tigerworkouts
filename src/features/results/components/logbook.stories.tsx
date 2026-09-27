import type { Meta, StoryObj } from '@storybook/react-vite';
import { EX } from '@/features/runsheet/fixtures';
import type { SessionResult } from '@/features/runsheet/progression';
import { ExerciseHistoryScreen } from './exercise-history-screen';
import { ExerciseListScreen } from './exercise-list-screen';

const day = 864e5;
const at = (d: number) => new Date(Date.UTC(2026, 7, 16) + d * day).toISOString();
const bench = (sets: [number, number][]) => ({ stepId: 'bench', exerciseKey: 'bb_bench', sets: sets.map(([load, reps]) => ({ load, reps })) });
const sprint = (kph: number[]) => ({ stepId: 'sprint', exerciseKey: 'sprint', incline: 2, sets: kph.map(load => ({ load })) });
const results: SessionResult[] = [
  { id: '6', runsheetId: 'p', title: 'Push day', startedAt: at(40), steps: [bench([[67.5, 6], [67.5, 6], [67.5, 5]])] },
  { id: '5', runsheetId: 'h', title: 'Heavy singles', startedAt: at(33), steps: [bench([[70, 3], [72.5, 2], [75, 1]])] },
  { id: '4', runsheetId: 'p', title: 'Push day', startedAt: at(24), steps: [bench([[65, 7], [67.5, 5], [67.5, 4]]), sprint([14, 14.5, 14.5])] },
  { id: '3', runsheetId: 'p', title: 'Push day', startedAt: at(14), steps: [bench([[65, 6], [65, 6], [60, 10]])] },
  { id: '2', runsheetId: 'p', title: 'Push day', startedAt: at(7), steps: [bench([[62.5, 8], [62.5, 7], [62.5, 6]]), sprint([13, 13.5, 14])] },
  { id: '1', runsheetId: 'p', title: 'Push day', startedAt: at(0), steps: [{ stepId: 'bench', exerciseKey: 'bb_bench', target: 60, reps: [8, 8, 7] }] },
];

const meta = {
  title: 'Results/ExerciseHistory',
  component: ExerciseHistoryScreen,
  parameters: { layout: 'fullscreen', docs: { description: { component: 'One exercise across every session: back link, thumb and name; a white card with a coral line of the best set per session (estimated 1RM, top load or speed, most reps, or rounds), low/high values on the left and first/last dates underneath; a 2-column grid of record tiles with the date each was set; then one card per session, newest first, with its sets as grey pills and a coral "PR" tag on a set that beat a record standing at the time.' } } },
  args: { exercise: EX.bb_bench, results, onBack: () => {} },
  decorators: [S => <div className="mx-auto h-[820px] w-[393px] overflow-hidden border-x border-line"><S /></div>],
} satisfies Meta<typeof ExerciseHistoryScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Lift: Story = {};
export const TimedWork: Story = { args: { exercise: EX.sprint } };
export const NotLoggedYet: Story = { args: { results: [] } };
export const ExerciseList: Story = {
  render: () => <ExerciseListScreen results={results} exercise={k => EX[k] ?? { key: k, name: k, unit: '', step: 1 }} onBack={() => {}} onOpen={() => {}} />,
};
