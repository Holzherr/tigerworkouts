import type { Meta, StoryObj } from '@storybook/react-vite';
import { EX, priyanka } from '@/features/runsheet/fixtures';
import { makeExercise, type Runsheet } from '@/features/runsheet/model';
import * as R from '../runner';
import { useRunner } from '../use-runner';
import { TimerScreen } from './timer-screen';

const cindy = (): Runsheet => ({ id: 'cindy', title: 'Cindy', items: [{ kind: 'block', id: 'b', name: 'Cindy', mode: 'amrap', timeCapSec: 1200, repeat: 1, steps: [{ ...makeExercise(EX.bw_pullup, { forMode: 'reps', forValue: 5 }), id: 'a' }, { ...makeExercise(EX.bw_pushup, { forMode: 'reps', forValue: 10 }), id: 'b2' }, { ...makeExercise(EX.bw_squat, { forMode: 'reps', forValue: 15 }), id: 'c' }] }] });

/** Bench pyramid 60 / 70 / 80 kg for 10 / 8 / 6, a minute's rest between sets. */
const pyramid = (): Runsheet => ({ id: 'pyramid', title: 'Bench pyramid', items: [{ kind: 'block', id: 'b', name: 'Bench', repeat: 3, steps: [{ ...makeExercise(EX.bb_bench, { forMode: 'reps', forValue: 10, target: 60 }), id: 'bench', sets: [{ reps: 10, load: 60 }, { reps: 8, load: 70 }, { reps: 6, load: 80 }] }, { kind: 'rest', id: 'r', seconds: 60 }] }] });

const Live = ({ runsheet, ghost, goal }: { runsheet: Runsheet; ghost?: string; goal?: string }) => {
  const { state, now, act } = useRunner(runsheet, { persist: false });
  return <TimerScreen runsheet={runsheet} state={state} now={now} onDone={act.done} onSkip={act.skip} onBack={act.back} onPause={act.pause} onResume={act.resume} onAdjust={act.adjust} onSetReps={act.setReps} onDrop={act.drop} onStartBlock={act.startBlock} onAdjustIncline={act.adjustIncline} sets={{ adjust: act.adjustAt, setReps: act.setRepsAt, complete: act.completeSet, reopen: act.reopenSet, lastFor: (_, i) => (i < 2 ? { load: 57.5 + i * 5, reps: 8 } : undefined), fill: act.fillSet }} onAdjustRest={act.extendRest} lastFor={() => ({ load: 20, reps: 12 })} onFill={act.fillSet} ghost={ghost} goal={goal} muted={false} onToggleMute={() => {}} onFinish={() => alert(JSON.stringify(R.toResult(state, runsheet, Date.now()), null, 1))} onExit={() => alert('exit')} />;
};

const meta = {
  title: 'Timer/TimerScreen',
  component: TimerScreen,
  parameters: { layout: 'fullscreen', docs: { description: { component: 'The gym screen on a dark ground, tidied (Nick, 18 Oct 2026, after Priyanka found it too busy). Header: ✕ to end the session, block name with “Block 3 of 5 · Round 1 of 5”, % done over the elapsed time, ⋯ (sound, overview, swap, end); a thin progress bar; under it one quiet line with today’s target and the race against last time (“Target 45 × 10 · 14:26 ahead of last time”). A huge clock (countdown or count-up). The current step is a white card: a 72px clip (tap for the how-to), “Exercise 1 of 2” and the name, then one line of what the set logs (“24 kg × 10 reps”, “Last time 24 × 10” under it) with Change, which opens the weight, incline, reps or metres steppers in place (Close folds them). One line says what is next (“Next  Rest  1:20”). A small row of Back, Pause or Done early, and Skip over the big button: Pause on a countdown, “Set 2 of 3 done” on a set. A rest has −15s / +15s either side of its clock. A straight-set block shows its sets: a done set is one line with its tick, the next has its steppers and last time’s numbers, and the sets after it fold into “2 more sets”. Swipe the card to drop the exercise. A visually hidden polite live region tells a screen reader where the session is on each change and never on a tick: “Get ready, 5 seconds”, “Kettlebell swings, 10 reps, round 2 of 8”, “Rest, 30 seconds”, “Barbell bench press, set 2 of 3”, “Paused”, “Workout finished”. `announce={false}` leaves it out; only the landing page’s looping demo does. Stories run the real runner with live time.' } } },
  args: { runsheet: priyanka(), state: R.start(priyanka(), Date.now()), now: Date.now(), onDone: () => {}, onSkip: () => {}, onBack: () => {}, onPause: () => {}, onResume: () => {}, onAdjust: () => {}, onSetReps: () => {}, onDrop: () => {}, onFinish: () => {}, onExit: () => {} },
  decorators: [S => <div className="relative mx-auto h-[820px] w-[393px] overflow-hidden border-x border-line"><S /></div>],
} satisfies Meta<typeof TimerScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PriyankasCircuit: Story = { render: () => <Live runsheet={priyanka()} /> };
export const CindyAmrap: Story = { render: () => <Live runsheet={cindy()} /> };
export const StraightSets: Story = { render: () => <Live runsheet={pyramid()} /> };
export const RacingLastTime: Story = { render: () => <Live runsheet={priyanka()} ghost="Round 4 — 12 s ahead" goal="Target 24 × 10" /> };
/** Past the lead-in on set 1 of the pyramid: no clock runs, so the big button logs the set. */
export const OnASet: Story = { args: { runsheet: pyramid(), state: R.advance(R.start(pyramid(), 0), 0, { skipped: true }), now: 0 } };
/** Set 1 of the pyramid ticked, resting before set 2: the done set on one line, set 2 open, set 3 folded. */
export const RestBetweenSets: Story = {
  args: {
    runsheet: pyramid(),
    state: R.advance(R.startBlock(R.advance(R.start(pyramid(), 0), 0, { skipped: true }), 0), 0),
    now: 2000,
    sets: { adjust: () => {}, setReps: () => {}, complete: () => {}, reopen: () => {}, lastFor: (_, i) => ({ load: 60 + i * 10, reps: 9 - i }) },
    onAdjustRest: () => {},
    goal: 'Target 70 × 8',
    ghost: 'Set 1 — 0:12 ahead',
  },
};

/** Rower sprints, 3 × 30 s on the rower with 30 s rest: a timed piece asks for nothing to log. */
const sprints = (log?: 'meters'): Runsheet => ({ id: 'sprints', title: 'Rower sprints', items: [{ kind: 'block', id: 'b', name: 'Rower sprints', repeat: 3, steps: [{ ...makeExercise(EX.cardio_rower, { forMode: 'seconds', forValue: 30 }), ...(log ? { log } : {}), id: 'rw' }, { kind: 'rest', id: 'r', seconds: 30 }] }, { ...makeExercise(EX.kb_swing, { forMode: 'seconds', forValue: 30, target: 24 }), id: 'sw' }] });
const onSprint = (r: Runsheet) => R.advance(R.start(r, 0), 0, { skipped: true });
/** A 30 s rower step that logs nothing: no metres to enter, finishing the timer is the result. */
export const TimedRowerNoLog: Story = { args: { runsheet: sprints(), state: onSprint(sprints()), now: 12000, onSetAmount: () => {} } };
/** The same step set to log metres (Add to log in the editor): the card asks for them. */
export const TimedRowerLogsMetres: Story = { args: { runsheet: sprints('meters'), state: onSprint(sprints('meters')), now: 12000, onSetAmount: () => {} } };
