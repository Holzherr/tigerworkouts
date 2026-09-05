import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { EX } from '../fixtures';
import { makeExercise, makeRest, type Step } from '../model';
import { StepRow } from './step-row';

const meta = {
  title: 'Runsheet/StepRow',
  component: StepRow,
  parameters: {
    docs: {
      description: {
        component:
          'One line of the runsheet, 348px wide on a phone. Collapsed: 48px clip thumbnail, name with duration under it, grey value pill ("28 kg"), caret, ✕. Expanded (orange tint): 72px clip, the name is the swap target ("tap name to change ›"), then Weight (unit in the label) with a stepper and For with a stepper plus a seconds / reps / minutes dropdown. Rest rows swap the clip for a grey pause square and show quick-pick chips when open.',
      },
    },
  },
  args: { step: { ...makeExercise(EX.kb_swing, { target: 28 }), id: 'a' }, expanded: false, onToggle: () => {}, onChange: () => {}, onRemove: () => {} },
  decorators: [S => <div className="w-[348px] overflow-hidden rounded-card border border-line bg-surface"><S /></div>],
} satisfies Meta<typeof StepRow>;

export default meta;
type Story = StoryObj<typeof meta>;

const swings = { ...makeExercise(EX.kb_swing, { target: 28 }), id: 'a' };
const press = { ...makeExercise(EX.db_incline_press, { target: 20 }), id: 'b' };
const pushups = { ...makeExercise(EX.pushup, { forMode: 'reps', forValue: 12 }), id: 'c' };
const rest = { ...makeRest(30), id: 'r' };

const Live = ({ step: init, expanded: e0 = false }: { step: Step; expanded?: boolean }) => {
  const [step, setStep] = useState<Step>(init);
  const [expanded, setExpanded] = useState(e0);
  return <StepRow step={step} expanded={expanded} onToggle={() => setExpanded(x => !x)} onChange={setStep} onRemove={() => alert('remove')} onSwap={() => alert('swap')} />;
};

export const Resting: Story = { args: { step: swings } };
export const Expanded: Story = { render: () => <Live step={press} expanded /> };
export const RepsExercise: Story = { render: () => <Live step={pushups} expanded /> };
export const RestResting: Story = { args: { step: rest } };
export const RestExpanded: Story = { render: () => <Live step={rest} expanded /> };
export const Lifted: Story = { args: { step: swings, lifted: true } };
export const GroupTarget: Story = { args: { step: press, groupTarget: true } };
export const WithHint: Story = { args: { step: press, hint: 'last time 17.5 kg' } };
