import type { Meta, StoryObj } from '@storybook/react-vite';
import { EX, priyanka } from '@/features/runsheet/fixtures';
import { makeExercise, type Runsheet } from '@/features/runsheet/model';
import * as R from '../runner';
import { useRunner } from '../use-runner';
import { TimerScreen } from './timer-screen';

const cindy = (): Runsheet => ({ id: 'cindy', title: 'Cindy', items: [{ kind: 'block', id: 'b', name: 'Cindy', mode: 'amrap', timeCapSec: 1200, repeat: 1, steps: [{ ...makeExercise(EX.bw_pullup, { forMode: 'reps', forValue: 5 }), id: 'a' }, { ...makeExercise(EX.bw_pushup, { forMode: 'reps', forValue: 10 }), id: 'b2' }, { ...makeExercise(EX.bw_squat, { forMode: 'reps', forValue: 15 }), id: 'c' }] }] });

const Live = ({ runsheet }: { runsheet: Runsheet }) => {
  const { state, now, act } = useRunner(runsheet);
  return <TimerScreen runsheet={runsheet} state={state} now={now} onDone={act.done} onSkip={act.skip} onBack={act.back} onPause={act.pause} onResume={act.resume} onAdjust={act.adjust} onSetReps={act.setReps} onDrop={act.drop} onFinish={() => alert(JSON.stringify(R.toResult(state, runsheet, Date.now()), null, 1))} onExit={() => alert('exit')} />;
};

const meta = {
  title: 'Timer/TimerScreen',
  component: TimerScreen,
  parameters: { layout: 'fullscreen', docs: { description: { component: 'The gym screen on a dark ground: block name, round counter and total time in the header with a progress bar; a huge clock (countdown or count-up); the current step as a white card with a 72px clip, name, weight or speed stepper and reps stepper; a Next row; back / pause / Done or Skip controls. Swipe the card to drop the exercise. Stories run the real runner with live time.' } } },
  args: { runsheet: priyanka(), state: R.start(priyanka(), Date.now()), now: Date.now(), onDone: () => {}, onSkip: () => {}, onBack: () => {}, onPause: () => {}, onResume: () => {}, onAdjust: () => {}, onSetReps: () => {}, onDrop: () => {}, onFinish: () => {}, onExit: () => {} },
  decorators: [S => <div className="relative mx-auto h-[820px] w-[393px] overflow-hidden border-x border-line"><S /></div>],
} satisfies Meta<typeof TimerScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PriyankasCircuit: Story = { render: () => <Live runsheet={priyanka()} /> };
export const CindyAmrap: Story = { render: () => <Live runsheet={cindy()} /> };
