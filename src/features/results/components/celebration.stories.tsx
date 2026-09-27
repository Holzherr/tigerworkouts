import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { SessionResult } from '@/features/runsheet/progression';
import { celebrate } from '../celebrate';
import { shareCardData } from '../share-card';
import { CelebrationCard } from './celebration-card';
import { EffortRow } from './effort-row';
import { ShareCardSheet } from './share-card-sheet';

const s = (id: string, startedAt: string, sets: [number, number][], extra: Partial<SessionResult> = {}): SessionResult => ({
  id, runsheetId: 'push', title: 'Push day', startedAt, durationSec: 2700, score: 540,
  steps: [{ stepId: 'b', exerciseKey: 'bb_bench', sets: sets.map(([load, reps]) => ({ load, reps })) }, { stepId: 'p', exerciseKey: 'bw_pushup', sets: [{ reps: 15 + sets.length }] }],
  ...extra,
});
const history = [s('s1', '2026-09-08T17:00:00Z', [[60, 8], [60, 8]]), s('s2', '2026-09-15T17:00:00Z', [[62.5, 8], [62.5, 6]], { score: 560 }), s('s3', '2026-09-22T17:00:00Z', [[62.5, 8]], { durationSec: 2400 })];
const today = s('s4', '2026-09-27T17:00:00Z', [[65, 5], [67.5, 3], [60, 10]], { score: 520, rpe: 8 });
const name = (k: string) => ({ name: k === 'bb_bench' ? 'Bench press' : 'Push-up', unit: k === 'bb_bench' ? 'kg' : '' });

const meta = {
  title: 'Results/Celebration',
  component: CelebrationCard,
  parameters: { layout: 'centered', docs: { description: { component: 'Top of the finish screen, on the soft coral panel: "Workout 42" in black, the streak in coral ink, Share on the right; then a row per record set today (medal, exercise, set) and "vs last time" lines with an arrow up (coral) or down (grey). Empty sections are left out.' } } },
  decorators: [(S: () => React.ReactElement) => <div className="w-[390px] bg-canvas p-3"><S /></div>],
  args: { celebration: celebrate(today, [...history, today]), scoreType: 'time', exercise: name, onShare: () => {} },
} satisfies Meta<typeof CelebrationCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const RecordsAndDeltas: Story = {};
export const FirstTime: Story = { args: { celebration: celebrate(history[0], [history[0]]) } };

export const Effort: Story = {
  render: () => {
    const [v, setV] = useState<number | undefined>(7);
    return <EffortRow value={v} onChange={setV} />;
  },
};

export const ShareCard: Story = {
  render: () => <ShareCardSheet open onOpenChange={() => {}} data={shareCardData(today, celebrate(today, [...history, today]), 'time', name)} />,
};
