import type { Meta, StoryObj } from '@storybook/react-vite';
import { EX, priyanka } from '@/features/runsheet/fixtures';
import { makeExercise, type Runsheet } from '@/features/runsheet/model';
import * as R from '../runner';
import { useRunner } from '../use-runner';
import { TimerScreen } from './timer-screen';

const cindy = (): Runsheet => ({ id: 'cindy', title: 'Cindy', items: [{ kind: 'block', id: 'b', name: 'Cindy', mode: 'amrap', timeCapSec: 1200, repeat: 1, steps: [{ ...makeExercise(EX.bw_pullup, { forMode: 'reps', forValue: 5 }), id: 'a' }, { ...makeExercise(EX.bw_pushup, { forMode: 'reps', forValue: 10 }), id: 'b2' }, { ...makeExercise(EX.bw_squat, { forMode: 'reps', forValue: 15 }), id: 'c' }] }] });

/** Bench pyramid 60 / 70 / 80 kg for 10 / 8 / 6, a minute's rest between sets. */
const pyramid = (): Runsheet => ({ id: 'pyramid', title: 'Bench pyramid', items: [{ kind: 'block', id: 'b', name: 'Bench', repeat: 3, steps: [{ ...makeExercise(EX.bb_bench, { forMode: 'reps', forValue: 10, target: 60 }), id: 'bench', sets: [{ reps: 10, load: 60 }, { reps: 8, load: 70 }, { reps: 6, load: 80 }] }, { kind: 'rest', id: 'r', seconds: 60 }] }] });

const Live = ({ runsheet, ghost }: { runsheet: Runsheet; ghost?: string }) => {
  const { state, now, act } = useRunner(runsheet, { persist: false });
  return <TimerScreen runsheet={runsheet} state={state} now={now} onDone={act.done} onSkip={act.skip} onBack={act.back} onPause={act.pause} onResume={act.resume} onAdjust={act.adjust} onSetReps={act.setReps} onDrop={act.drop} onStartBlock={act.startBlock} onAdjustIncline={act.adjustIncline} sets={{ adjust: act.adjustAt, setReps: act.setRepsAt, complete: act.completeSet, reopen: act.reopenSet, lastFor: (_, i) => (i < 2 ? { load: 57.5 + i * 5, reps: 8 } : undefined), fill: act.fillSet }} onAdjustRest={act.extendRest} lastFor={() => ({ load: 20, reps: 12 })} onFill={act.fillSet} ghost={ghost} onFinish={() => alert(JSON.stringify(R.toResult(state, runsheet, Date.now()), null, 1))} onExit={() => alert('exit')} />;
};

const meta = {
  title: 'Timer/TimerScreen',
  component: TimerScreen,
  parameters: { layout: 'fullscreen', docs: { description: { component: 'The gym screen on a dark ground: block name, round counter and total time in the header with a progress bar; a huge clock (countdown or count-up); the current step as a white card with a 72px clip, name, weight or speed stepper and reps stepper; a Next row; back / pause / Done or Skip controls. A rest gets −15 s / +15 s under its clock. The coral-ink “Last time” line (card and set rows) copies the numbers from last time into the set. With a timed last session, a pill under the header reads “Round 4 — 12 s ahead”. Swipe the card to drop the exercise. Stories run the real runner with live time.' } } },
  args: { runsheet: priyanka(), state: R.start(priyanka(), Date.now()), now: Date.now(), onDone: () => {}, onSkip: () => {}, onBack: () => {}, onPause: () => {}, onResume: () => {}, onAdjust: () => {}, onSetReps: () => {}, onDrop: () => {}, onFinish: () => {}, onExit: () => {} },
  decorators: [S => <div className="relative mx-auto h-[820px] w-[393px] overflow-hidden border-x border-line"><S /></div>],
} satisfies Meta<typeof TimerScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PriyankasCircuit: Story = { render: () => <Live runsheet={priyanka()} /> };
export const CindyAmrap: Story = { render: () => <Live runsheet={cindy()} /> };
export const StraightSets: Story = { render: () => <Live runsheet={pyramid()} /> };
export const RacingLastTime: Story = { render: () => <Live runsheet={priyanka()} ghost="Round 4 — 12 s ahead" /> };
