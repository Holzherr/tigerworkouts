import type { Meta, StoryObj } from '@storybook/react-vite';
import { SessionStats } from './session-stats';
import type { SessionResult } from '@/features/runsheet/progression';

const result: SessionResult = {
  id: 's-1',
  runsheetId: 'u-1',
  title: 'Swings, incline press & sprints',
  startedAt: '2026-09-17T17:26:00Z',
  endedAt: '2026-09-17T17:50:00Z',
  durationSec: 1440,
  steps: [],
};

const worked = [
  ...Array.from({ length: 8 }, () => ({ name: 'Kettlebell swings', group: 'kettlebell' as const, seconds: 30, reps: 15, load: 28 })),
  ...Array.from({ length: 8 }, () => ({ name: 'Incline chest press', group: 'dumbbell' as const, seconds: 30, reps: 10, load: 20 })),
  ...Array.from({ length: 8 }, () => ({ name: 'Treadmill sprints', group: 'treadmill' as const, seconds: 30, reps: 0 })),
];

const history: SessionResult[] = [result, { ...result, id: 's-2', startedAt: '2026-09-15T17:00:00Z' }, { ...result, id: 's-3', startedAt: '2026-09-10T17:00:00Z' }];

const meta = {
  title: 'Results/SessionStats',
  component: SessionStats,
  parameters: { layout: 'centered', docs: { description: { component: 'What a finished session comes to: work time and sets, a METs calorie estimate, tonnage, the muscles it worked shaded by share of working time, and whether the habit is holding.' } } },
  decorators: [(S: () => React.ReactElement) => <div className="w-[390px] bg-canvas p-3"><S /></div>],
} satisfies Meta<typeof SessionStats>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AfterACircuit: Story = { args: { result, worked, history, bodyweightKg: 82 } };
export const NoBodyweightSet: Story = { args: { result, worked, history } };
export const CardioOnly: Story = { args: { result, worked: [{ name: 'Incline walk', group: 'walk', seconds: 600, reps: 0 }], history, bodyweightKg: 82 } };
