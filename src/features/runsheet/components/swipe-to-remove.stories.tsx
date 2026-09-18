import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { EX } from '../fixtures';
import { makeExercise, makeRest, type Step } from '../model';
import { StepRow } from './step-row';
import { SwipeToRemove } from './swipe-to-remove';

const meta = {
  title: 'Runsheet/SwipeToRemove',
  component: SwipeToRemove,
  parameters: {
    docs: {
      description: {
        component:
          'Touch-only gesture wrapper for a row: drag left and a red field with a bin grows behind it; past halfway the Remove label appears and releasing deletes. Use the mobile viewport and touch emulation in the toolbar to try it; with a mouse the ✕ on the row does the same job.',
      },
    },
  },
  args: { onRemove: () => {}, children: null },
  decorators: [S => <div className="w-[348px] bg-canvas p-2"><S /></div>],
} satisfies Meta<typeof SwipeToRemove>;

export default meta;
type Story = StoryObj<typeof meta>;

const Live = () => {
  const [steps, setSteps] = useState<Step[]>([{ ...makeExercise(EX.kb_swing, { target: 28 }), id: 'a' }, { ...makeRest(30), id: 'r' }, { ...makeExercise(EX.lat_raise, { target: 7.5 }), id: 'b' }]);
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface [&>*+*]:border-t [&>*+*]:border-line-soft">
      {steps.map(s => (
        <SwipeToRemove key={s.id} onRemove={() => setSteps(x => x.filter(y => y.id !== s.id))}>
          <StepRow step={s} expanded={false} onToggle={() => {}} onChange={() => {}} onRemove={() => setSteps(x => x.filter(y => y.id !== s.id))} />
        </SwipeToRemove>
      ))}
      {steps.length === 0 && <div className="p-4 text-center text-[13px] text-muted">All removed. Reload the story.</div>}
    </div>
  );
};

export const Default: Story = { render: () => <Live /> };
