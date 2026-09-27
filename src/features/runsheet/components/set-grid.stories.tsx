import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { EX } from '../fixtures';
import { makeExercise, makeRest, type Block } from '../model';
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
