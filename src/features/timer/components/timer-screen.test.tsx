import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EX } from '@/features/runsheet/fixtures';
import { makeExercise, type ExerciseStep, type Runsheet } from '@/features/runsheet/model';
import * as R from '../runner';
import { composeStories } from '@storybook/react-vite';
import { TimerScreen } from './timer-screen';
import * as stories from './timer.stories';

const Stories = composeStories(stories);

// Push-ups for 3 rounds, then a 30 s hold on the clock.
const sheet: Runsheet = { id: 'c', title: 'C', items: [{ kind: 'block', id: 'b', name: 'Push', repeat: 3, steps: [{ ...makeExercise(EX.bw_pushup, { forMode: 'reps', forValue: 10 }), id: 'p' }] }, { ...makeExercise(EX.bw_pushup, { forMode: 'seconds', forValue: 30 }), id: 'h' }] };
const on = { onDone: vi.fn(), onSkip: vi.fn() };
/** Past the lead-in, `n` steps on: 1 is set 2 of the push-ups, 3 the hold. */
const show = (n: number) => render(<TimerScreen runsheet={sheet} state={Array.from({ length: n }).reduce<R.RunState>(s => R.advance(s, 0), R.advance(R.start(sheet, 0), 0, { skipped: true }))} now={0} onPause={vi.fn()} onFinish={vi.fn()} onBack={vi.fn()} onResume={vi.fn()} onAdjust={vi.fn()} onSetReps={vi.fn()} onDrop={vi.fn()} onExit={vi.fn()} {...on} />);
const big = (name: string) => /w-full.*h-16|h-16.*w-full/.test(screen.getByRole('button', { name }).className);

it('makes Set n of m done the big button on a set, Skip says Skip this step, ⋯ sits top right', () => {
  show(1);
  expect([big('Set 2 of 3 done'), big('Pause'), !!screen.getByRole('button', { name: 'More' }).closest('header')]).toEqual([true, false, true]);
  fireEvent.click(screen.getByRole('button', { name: 'Set 2 of 3 done' }));
  fireEvent.click(screen.getByRole('button', { name: 'Skip this step' }));
  expect([on.onDone.mock.calls.length, on.onSkip.mock.calls.length]).toEqual([1, 1]);
});
it('makes Pause the big button on a countdown, with Done early small', () => {
  show(3);
  expect([big('Pause'), big('Done early')]).toEqual([true, false]);
});

// Goblet squat 24 kg × 10 for 2 rounds, a 30 s rest, then bench 4 × 10 at 45 kg with 90 s rests.
const tidy: Runsheet = {
  id: 't',
  title: 'T',
  items: [
    { ...makeExercise(EX.db_incline_press, { forMode: 'reps', forValue: 10, target: 24 }), id: 'g' },
    { kind: 'rest', id: 'r0', seconds: 30 },
    { kind: 'block', id: 'bb', name: 'Bench', repeat: 4, steps: [{ ...makeExercise(EX.bb_bench, { forMode: 'reps', forValue: 10, target: 45 }), id: 'bench' }, { kind: 'rest', id: 'r', seconds: 90 }] },
  ],
};
const noop = () => {};
const grid = { adjust: noop, setReps: noop, complete: noop, reopen: noop };
const at = (state: R.RunState, extra: Partial<Parameters<typeof TimerScreen>[0]> = {}) =>
  render(<TimerScreen runsheet={tidy} state={state} now={0} onDone={noop} onSkip={noop} onBack={noop} onPause={noop} onResume={noop} onAdjust={noop} onSetReps={noop} onDrop={noop} onFinish={noop} onExit={noop} sets={grid} onAdjustRest={noop} {...extra} />);
const onCard = () => R.advance(R.start(tidy, 0), 0, { skipped: true });
/** Bench set 1 ticked, resting before set 2. */
const resting = () => R.advance(R.startBlock(R.advance(R.advance(onCard(), 0), 0), 0), 0);

it('keeps sound and the overview in the ⋯ menu, with ✕ to end the session', () => {
  const toggle = vi.fn();
  at(onCard(), { onToggleMute: toggle });
  fireEvent.click(screen.getByRole('button', { name: 'End session' }));
  expect(screen.getByText('End this session?')).toBeTruthy();
  expect([screen.queryByRole('button', { name: 'Mute tones' }), screen.queryByRole('button', { name: 'Workout overview' })]).toEqual([null, null]);
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  fireEvent.click(screen.getByRole('button', { name: 'Mute tones' }));
  expect(toggle).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: /Workout overview/ })).toBeTruthy();
});

it('folds load and reps into one line, Change opens the steppers in place', () => {
  const v = at(onCard());
  const row = screen.getByRole('button', { name: /^24 kg × 10 reps\. Change$/ });
  expect([row.getAttribute('aria-expanded'), screen.queryByRole('group', { name: 'Reps' }), screen.queryByLabelText('Reps')]).toEqual(['false', null, null]);
  expect(v.container.textContent).not.toContain('Exercise 1 of');
  fireEvent.click(row);
  expect(screen.getByRole('button', { name: /Close$/ }).getAttribute('aria-expanded')).toBe('true');
  expect(screen.getAllByLabelText(/Reps|Target/).length).toBeGreaterThan(0);
  // The next step comes folded again.
  v.rerender(<TimerScreen runsheet={tidy} state={R.advance(onCard(), 0)} now={0} onDone={noop} onSkip={noop} onBack={noop} onPause={noop} onResume={noop} onAdjust={noop} onSetReps={noop} onDrop={noop} onFinish={noop} onExit={noop} sets={grid} />);
  expect(screen.queryByRole('button', { name: /Close$/ })).toBeNull();
});

it('says what comes next on one line', () => {
  at(onCard());
  expect(screen.getByRole('button', { name: 'NextRest0:30' })).toBeTruthy();
  cleanup();
  at(R.advance(onCard(), 0));
  expect(screen.getByRole('button', { name: 'Next blockBench10 reps' })).toBeTruthy();
});

it('reads target and race as one line, ±15 s either side of the rest clock', () => {
  const v = at(resting(), { goal: 'Target 45 × 10', ghost: 'Set 1 — 14:26 ahead' });
  expect(v.container.textContent).toContain('Target 45 × 10 · 14:26 ahead of last time');
  const less = screen.getByRole('button', { name: '15 seconds less rest' });
  expect(less.parentElement).toBe(screen.getByRole('button', { name: '15 seconds more rest' }).parentElement);
  expect(less.parentElement!.textContent).toContain('1:30');
});

it('shows a done set as one line, the next with its steppers, the rest folded', () => {
  const v = at(resting());
  const sets = screen.getByLabelText('Sets');
  expect(sets.textContent).not.toMatch(/^.*SetKG/i);
  expect(screen.getByRole('button', { name: 'Un-tick set 1' }).parentElement!.textContent).toContain('Set 145 kg × 10');
  expect(screen.getAllByRole('group').length >= 0 && screen.getByLabelText('Set 2 load')).toBeTruthy();
  expect(screen.queryByLabelText('Set 3 load')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /^2 more sets, 45 kg × 10/ }));
  expect(screen.getByRole('button', { name: 'Tick set 4' })).toBeTruthy();
  expect(v.container.textContent).toContain('Set 3');
});

it('the RestBetweenSets story rests after set 1 with set 3 folded', () => {
  render(<Stories.RestBetweenSets />);
  expect([!!screen.getByRole('button', { name: 'Un-tick set 1' }), !!screen.getByLabelText('Set 2 load'), !!screen.getByRole('button', { name: /^1 more set,/ }), !!screen.getByText('Target 70 × 8 · 0:12 ahead of last time')]).toEqual([true, true, true, true]);
});

describe('what the card asks to log', () => {
  const rowerSheet = (log?: ExerciseStep['log']): Runsheet => ({ id: 'rs', title: 'Rower sprints', items: [{ ...makeExercise(EX.cardio_rower, { forMode: 'seconds', forValue: 30 }), ...(log ? { log } : {}), id: 'rw' }, { ...makeExercise(EX.kb_swing, { forMode: 'seconds', forValue: 30, target: 24 }), log: 'reps', id: 'sw' }] });
  const card = (r: Runsheet, state = R.advance(R.start(r, 0), 0, { skipped: true })) =>
    render(<TimerScreen runsheet={r} state={state} now={0} onDone={noop} onSkip={noop} onBack={noop} onPause={noop} onResume={noop} onAdjust={noop} onSetReps={noop} onSetAmount={noop} onDrop={noop} onFinish={noop} onExit={noop} />);
  it('a timed rower asks for no metres', () => {
    card(rowerSheet());
    expect(screen.queryByRole('button', { name: /m\. Change$/ })).toBeNull();
    expect(screen.queryByText('Metres done')).toBeNull();
  });
  it('a timed rower set to log metres asks for them', () => {
    card(rowerSheet('meters'));
    fireEvent.click(screen.getByRole('button', { name: /^0 m\. Change$/ }));
    expect(screen.getByText('Metres done')).toBeTruthy();
  });
  it('a timed rower set to log metres and calories asks for both, nothing else', () => {
    card(rowerSheet(['meters', 'calories']));
    fireEvent.click(screen.getByRole('button', { name: /^0 m × 0 cal\. Change$/ }));
    expect(screen.getByText('Metres done')).toBeTruthy();
    expect(screen.getByText('Calories done')).toBeTruthy();
    expect(screen.queryByText('Reps done')).toBeNull();
    expect(screen.queryByLabelText('Target')).toBeNull();
  });
  it('timed swings set to log reps ask for reps next to the load', () => {
    const r = rowerSheet();
    card(r, R.advance(R.advance(R.start(r, 0), 0, { skipped: true }), 0));
    fireEvent.click(screen.getByRole('button', { name: /^24 kg × 0 reps\. Change$/ }));
    expect(screen.getByText('Reps done')).toBeTruthy();
  });
});

it('the set grid gives a timed row set to log metres a metres column, and shows them on done sets', () => {
  const r: Runsheet = { id: 'g', title: 'G', items: [{ kind: 'block', id: 'b', name: 'Rower sprints', repeat: 3, steps: [{ ...makeExercise(EX.cardio_rower, { forMode: 'seconds', forValue: 30 }), log: 'meters', id: 'rw' }, { kind: 'rest', id: 'r', seconds: 30 }] }] };
  let s = R.advance(R.startBlock(R.start(r, 0), 0), 0, { skipped: true });
  s = R.setAmountAt(s, s.slots[s.i].id, 142);
  s = R.tick(s, 30000);
  render(<TimerScreen runsheet={r} state={s} now={30000} onDone={noop} onSkip={noop} onBack={noop} onPause={noop} onResume={noop} onAdjust={noop} onSetReps={noop} onDrop={noop} onFinish={noop} onExit={noop} sets={{ ...grid, setAmount: noop }} />);
  expect(screen.getByText('30 sec · 142 m')).toBeTruthy();
  expect(screen.getByLabelText('Set 2 metres done')).toBeTruthy();
});

it('the set grid gives a rower logging metres and calories a column each', () => {
  const r: Runsheet = { id: 'g', title: 'G', items: [{ kind: 'block', id: 'b', name: 'Rower sprints', repeat: 3, steps: [{ ...makeExercise(EX.cardio_rower, { forMode: 'seconds', forValue: 30 }), log: ['meters', 'calories'], id: 'rw' }, { kind: 'rest', id: 'r', seconds: 30 }] }] };
  let s = R.advance(R.startBlock(R.start(r, 0), 0), 0, { skipped: true });
  s = R.setAmountAt(s, s.slots[s.i].id, 142, 'meters');
  s = R.setAmountAt(s, s.slots[s.i].id, 9, 'calories');
  s = R.tick(s, 30000);
  render(<TimerScreen runsheet={r} state={s} now={30000} onDone={noop} onSkip={noop} onBack={noop} onPause={noop} onResume={noop} onAdjust={noop} onSetReps={noop} onDrop={noop} onFinish={noop} onExit={noop} sets={{ ...grid, setAmount: noop }} />);
  expect(screen.getByText('30 sec · 142 m · 9 cal')).toBeTruthy();
  expect([!!screen.getByLabelText('Set 2 metres done'), !!screen.getByLabelText('Set 2 calories done'), screen.queryByLabelText('Set 2 load')]).toEqual([true, true, null]);
});
