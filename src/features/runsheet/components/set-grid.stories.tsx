import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { EX } from '../fixtures';
import { makeExercise, makeRest, setRuns, type Block } from '../model';
import { SetRuns } from './runsheet-list';
import { SetGrid } from './set-grid';

const bench = (): Block => ({ kind: 'block', id: 'b', name: 'Bench', repeat: 3, steps: [{ ...makeExercise(EX.bb_bench, { forMode: 'reps', forValue: 10, target: 60 }), id: 'bench', sets: [{ reps: 10, load: 60 }, { reps: 8, load: 70 }, { reps: 6, load: 80 }] }, { ...makeRest(90), id: 'r' }] });

const Live = () => {
  const [block, setBlock] = useState(bench);
  return <SetGrid block={block} onChange={setBlock} hintFor={i => (i === 0 ? 'last 57.5 × 10' : undefined)} />;
};

const meta = {
  title: 'Runsheet/SetGrid',
  component: SetGrid,
  parameters: { docs: { description: { component: 'A straight-set block (one exercise, rounds) in the editor: one row per set with its own load and reps, so a pyramid or ramping sets can be written as they are done. Add set copies the last row; Remove set drops it. Both change how many times the block repeats.' } } },
  args: { block: bench(), onChange: () => {} },
  decorators: [S => <div className="w-[348px] overflow-hidden rounded-card border border-line bg-surface"><S /></div>],
} satisfies Meta<typeof SetGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pyramid: Story = { render: () => <Live /> };

const typed = (): Block => ({ kind: 'block', id: 'b', name: 'Bench', repeat: 5, steps: [{ ...makeExercise(EX.bb_bench, { forMode: 'reps', forValue: 8, target: 60 }), id: 'bench', sets: [{ reps: 10, load: 40, type: 'warmup' }, { reps: 8, load: 60 }, { reps: 8, load: 60 }, { reps: 6, load: 60, type: 'failure' }, { reps: 8, load: 45, type: 'drop' }] }, { ...makeRest(90), id: 'r' }] });
const Typed = () => {
  const [block, setBlock] = useState(typed);
  return <SetGrid block={block} onChange={setBlock} equipment={{ barKg: 20, plates: [{ kg: 20, count: 2 }, { kg: 10, count: 2 }, { kg: 5, count: 2 }, { kg: 2.5, count: 2 }] }} />;
};
/** Warm-up (W), two working sets, one to failure (F) and a drop set (D). Tap a set number to change its type; the disc opens the plate calculator. */
export const SetTypes: Story = { render: () => <Typed /> };

const folded = (): Block => ({ kind: 'block', id: 'b', name: 'Press', repeat: 8, steps: [{ ...makeExercise(EX.kb_swing, { forMode: 'seconds', forValue: 30, target: 20 }), id: 'swing' }, { ...makeRest(60), id: 'r' }] });
const warmUpThenFour = (): Block => ({ ...bench(), repeat: 5, steps: [{ ...makeExercise(EX.bb_bench, { forMode: 'reps', forValue: 8, target: 60 }), id: 'bench', sets: [{ reps: 12, load: 40, type: 'warmup' }, { reps: 8, load: 60 }] }, { ...makeRest(90), id: 'r' }] });
/** How the editor shows sets: runs of alike sets fold into one row, Vary sets opens the grid above, and the grid folds back once the sets are alike again. */
const Runs = ({ initial }: { initial: () => Block }) => {
  const [block, setBlock] = useState(initial);
  const [vary, setVary] = useState(false);
  const change = (b: Block) => {
    if (setRuns(b).length === 1) setVary(false);
    setBlock(b);
  };
  return vary ? <SetGrid block={block} onChange={change} /> : <SetRuns block={block} onChange={change} onVary={() => setVary(true)} />;
};
/** 8 × 30 s at 20 kg: one row. A stepper on it changes all 8 sets. */
export const EightAlikeFolded: Story = { render: () => <Runs initial={folded} /> };
/** A warm-up and 4 working sets: two rows. */
export const WarmUpThenFour: Story = { render: () => <Runs initial={warmUpThenFour} /> };
