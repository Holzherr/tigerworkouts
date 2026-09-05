import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { EX, loose, priyanka } from '../fixtures';
import { makeExercise, runsheetMinutes, type ExerciseStep, type Item } from '../model';
import { RunsheetList } from './runsheet-list';

const meta = {
  title: 'Runsheet/RunsheetList',
  component: RunsheetList,
  parameters: {
    docs: {
      description: {
        component:
          'The whole editable list: blocks as orange brackets with a header and ×N pill, steps as white rows, loose steps as bordered cards, a ＋ on every seam and a dashed add tile at the end. Drag rows to reorder (hold 350ms on touch, just drag with a mouse); hover the middle of another row for 250ms to group. Stories keep state locally so you can try the gestures.',
      },
    },
  },
  args: { items: [], onChange: () => {}, onPickExercise: async () => null },
  decorators: [S => <div className="w-[372px] bg-canvas p-3"><S /></div>],
} satisfies Meta<typeof RunsheetList>;

export default meta;
type Story = StoryObj<typeof meta>;

const pick = async (): Promise<ExerciseStep | null> => {
  const keys = Object.keys(EX);
  const k = keys[Math.floor(Math.random() * keys.length)];
  return makeExercise(EX[k]);
};

const Live = ({ initial }: { initial: Item[] }) => {
  const [items, setItems] = useState(initial);
  return (
    <>
      <div className="mb-2 text-[12px] text-muted">{runsheetMinutes({ items })} min · {items.length} items</div>
      <RunsheetList items={items} onChange={setItems} onPickExercise={pick} onSwapExercise={pick} />
    </>
  );
};

export const PriyankasCircuit: Story = { render: () => <Live initial={priyanka().items} /> };
export const LooseSteps: Story = { render: () => <Live initial={loose().items} /> };
export const Empty: Story = { render: () => <Live initial={[]} /> };
