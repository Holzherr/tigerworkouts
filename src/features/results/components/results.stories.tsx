import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { EX, priyanka } from '@/features/runsheet/fixtures';
import { makeExercise, makeRest, type Block, type Runsheet } from '@/features/runsheet/model';
import type { NextLoad, SessionResult, TrainingMaxes } from '@/features/runsheet/progression';
import { ResultSheet } from './result-sheet';
import { ScoreEntry } from './score-entry';
import { TrainingMaxSheet } from './training-max-sheet';

const fran = (): Runsheet => ({
  id: 'cf-girls-fran',
  title: 'Fran',
  creator: 'CrossFit',
  items: [{ kind: 'block', id: 'b', name: '21-15-9', mode: 'ladder', ladder: [21, 15, 9], repeat: 1, steps: [{ ...makeExercise({ key: 'bb_thruster', name: 'Barbell thruster', unit: 'kg', step: 2.5 }, { forMode: 'reps', forValue: 21, target: 43 }), id: 't' }, { ...makeExercise(EX.bw_pullup, { forMode: 'reps', forValue: 21 }), id: 'p' }] }],
});
const cindy = (): Runsheet => ({ id: 'cindy', title: 'Cindy', items: [{ kind: 'block', id: 'b', name: 'Cindy', mode: 'amrap', timeCapSec: 1200, repeat: 1, steps: [{ ...makeExercise(EX.bw_pullup, { forMode: 'reps', forValue: 5 }), id: 'a' }, { ...makeExercise(EX.bw_pushup, { forMode: 'reps', forValue: 10 }), id: 'b2' }, { ...makeExercise(EX.bw_squat, { forMode: 'reps', forValue: 15 }), id: 'c' }] }] });
const stronglifts = (): Runsheet => {
  const blk = (id: string, name: string, key: string, kg: number): Block => ({ kind: 'block', id, name, repeat: 5, progression: { onSuccessKg: key === 'bb_back_squat' ? 2.5 : 2.5, deloadPct: 10, failAfter: 3 }, steps: [{ ...makeExercise(EX[key], { forMode: 'reps', forValue: 5, target: kg }), id: `${id}-s` }, { ...makeRest(180), id: `${id}-r` }] });
  return { id: 'prog-stronglifts-a', title: 'StrongLifts 5×5 · Workout A', program: { name: 'StrongLifts 5×5', day: 'Workout A', order: 1 }, items: [blk('sq', 'Squat 5×5', 'bb_back_squat', 60), blk('bp', 'Bench 5×5', 'bb_bench', 40), blk('rw', 'Row 5×5', 'bb_row', 35)] };
};
const wendler = (): Runsheet => ({
  id: 'prog-531-w1',
  title: '5/3/1 · Week 1 · Press',
  progression: { amrapBumpAt: 5, tmBumpKg: 2.5 },
  items: [{ kind: 'block', id: 'b', name: 'Press 5/5/5+', repeat: 1, steps: [{ ...makeExercise(EX.bb_ohp, { forMode: 'reps', forValue: 5 }), id: 's1', targetPct: 65, target: undefined }, { ...makeRest(120), id: 'r1' }, { ...makeExercise(EX.bb_ohp, { forMode: 'reps', forValue: 5 }), id: 's2', targetPct: 75, target: undefined }, { ...makeRest(120), id: 'r2' }, { ...makeExercise(EX.bb_ohp, { forMode: 'amrap', forValue: 5 }), id: 's3', targetPct: 85, target: undefined }] }],
});

const meta = {
  title: 'Results/ResultSheet',
  component: ResultSheet,
  parameters: { layout: 'fullscreen', docs: { description: { component: 'End-of-session sheet: score entry shaped by the score type at the top, one card per exercise with the load used and (for programs) made-it / missed or reps on the plus set, an orange "Next time" panel from the progression rules, notes, Save.' } } },
  args: { runsheet: fran(), onSave: (_r: SessionResult, _n: NextLoad[]) => {} },
  decorators: [S => <div className="mx-auto h-[820px] w-[393px] overflow-hidden border-x border-line"><S /></div>],
} satisfies Meta<typeof ResultSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ForTime: Story = { args: { runsheet: fran(), onSave: (r: SessionResult, n: NextLoad[]) => alert(JSON.stringify({ r, n }, null, 1)) } };
export const Amrap: Story = { args: { runsheet: cindy() } };
export const ProgramSession: Story = { args: { runsheet: stronglifts(), onSave: (_r: SessionResult, n: NextLoad[]) => alert(n.map(x => `${x.name}: ${x.from} → ${x.to} (${x.reason})`).join('\n')) } };
export const PercentageProgram: Story = { args: { runsheet: wendler(), trainingMaxes: { bb_ohp: 60 } } };
export const Priyanka: Story = { args: { runsheet: priyanka() } };

const TM = () => {
  const [v, setV] = useState<TrainingMaxes>({ bb_ohp: 60 });
  return (
    <div className="w-[372px] p-3">
      <TrainingMaxSheet runsheet={wendler()} values={v} onChange={setV} />
    </div>
  );
};
export const TrainingMaxEditor: Story = { render: () => <TM /> };

const Scores = () => {
  const [t, setT] = useState<number | undefined>(245);
  const [r, setR] = useState<number | undefined>(12.007);
  const [n, setN] = useState<number | undefined>(312);
  const [d, setD] = useState<number | undefined>(2400);
  return (
    <div className="w-[372px] space-y-4 p-3">
      <ScoreEntry type="time" value={t} onChange={setT} />
      <ScoreEntry type="rounds" value={r} onChange={setR} />
      <ScoreEntry type="reps" value={n} onChange={setN} />
      <ScoreEntry type="distance" value={d} onChange={setD} />
    </div>
  );
};
export const ScoreEntries: Story = { render: () => <Scores /> };
