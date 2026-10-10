import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TimerDemo } from '@/features/landing/components/timer-demo';
import { EX } from '@/features/runsheet/fixtures';
import { makeExercise, type Runsheet } from '@/features/runsheet/model';
import { TimerScreen } from './components/timer-screen';
import * as R from './runner';

/** Push-ups, 30 s rest, squats, 30 s rest, as three loose steps and a rest: no gate to tap through. */
const circuit = (): Runsheet => ({ id: 'c', title: 'Circuit', items: [{ ...makeExercise(EX.bw_pushup, { forMode: 'reps', forValue: 10 }), id: 'a' }, { kind: 'rest', id: 'r', seconds: 30 }, { ...makeExercise(EX.bw_squat, { forMode: 'reps', forValue: 15 }), id: 'b' }] });
/** Bench 3 × 8 with a minute between sets, run as a set grid. */
const bench = (): Runsheet => ({ id: 'p', title: 'Bench', items: [{ kind: 'block', id: 'blk', name: 'Bench', repeat: 3, steps: [{ ...makeExercise(EX.bb_bench, { forMode: 'reps', forValue: 8, target: 60 }), id: 'bench' }, { kind: 'rest', id: 'r', seconds: 60 }] }] });

const noop = () => {};
const sets = { adjust: noop, setReps: noop, complete: noop, reopen: noop };
const show = (runsheet: Runsheet, state: R.RunState, now: number) => {
  const view = render(<TimerScreen runsheet={runsheet} state={state} now={now} onDone={noop} onSkip={noop} onBack={noop} onPause={noop} onResume={noop} onAdjust={noop} onSetReps={noop} onDrop={noop} onFinish={noop} onExit={noop} sets={sets} />);
  const live = () => view.container.querySelectorAll('[aria-live]');
  return { ...view, live, text: () => live()[0]?.textContent, again: (s: R.RunState, t: number) => view.rerender(<TimerScreen runsheet={runsheet} state={s} now={t} onDone={noop} onSkip={noop} onBack={noop} onPause={noop} onResume={noop} onAdjust={noop} onSetReps={noop} onDrop={noop} onFinish={noop} onExit={noop} sets={sets} />) };
};

const t0 = 1_700_000_000_000;
/** The circuit past its lead-in: push-ups running. */
const running = () => R.advance(R.start(circuit(), t0), t0 + 5000);

describe('the timer announces where the session is', () => {
  it('renders one polite live region, visually hidden', () => {
    const v = show(circuit(), R.start(circuit(), t0), t0);
    expect(v.live()).toHaveLength(1);
    expect(v.live()[0]).toHaveAttribute('aria-live', 'polite');
    expect(v.live()[0]).toHaveAttribute('role', 'status');
    expect(v.live()[0]).toHaveClass('sr-only');
  });

  it('reads "Get ready, 5 seconds" during the lead-in', () => {
    expect(show(circuit(), R.start(circuit(), t0), t0).text()).toBe('Get ready, 5 seconds');
  });

  it('reads the exercise and its reps on a work step', () => {
    expect(show(circuit(), running(), t0 + 5000).text()).toBe('Push-up, 10 reps');
  });

  it('reads "Rest, 30 seconds" on a rest', () => {
    const rest = R.advance(running(), t0 + 20_000);
    expect(show(circuit(), rest, t0 + 20_000).text()).toBe('Rest, 30 seconds');
  });

  it('reads the set number on a straight-set block', () => {
    const second = R.advance(R.advance(R.startBlock(R.advance(R.start(bench(), t0), t0 + 5000), t0 + 5000), t0 + 30_000), t0 + 90_000);
    expect(R.current(second)?.step.id).toBe('bench');
    expect(show(bench(), second, t0 + 90_000).text()).toBe('Barbell bench press, set 2 of 3');
  });

  it('reads "Paused" when paused', () => {
    expect(show(circuit(), R.pause(running(), t0 + 6000), t0 + 6000).text()).toBe('Paused');
  });

  it('reads "Workout finished" when done', () => {
    let s = running();
    for (let t = t0 + 10_000; s.phase !== 'done'; t += 60_000) s = R.advance(s, t);
    expect(show(circuit(), s, t0 + 200_000).text()).toBe('Workout finished');
  });

  it('does not change on a tick, only when the slot changes', () => {
    const rest = R.advance(running(), t0 + 20_000);
    const v = show(circuit(), rest, t0 + 20_000);
    const before = v.text();
    for (let ms = 100; ms <= 1000; ms += 100) v.again(R.tick(rest, t0 + 20_000 + ms), t0 + 20_000 + ms);
    expect(v.text()).toBe(before);
    v.again(R.tick(rest, t0 + 50_000), t0 + 50_000);
    expect(v.text()).toBe('Bodyweight squat, 15 reps');
  });

  it('says nothing when told not to announce', () => {
    const view = render(<TimerScreen runsheet={circuit()} state={running()} now={t0 + 5000} onDone={noop} onSkip={noop} onBack={noop} onPause={noop} onResume={noop} onAdjust={noop} onSetReps={noop} onDrop={noop} onFinish={noop} onExit={noop} sets={sets} announce={false} />);
    expect(view.container.querySelectorAll('[aria-live]')).toHaveLength(0);
  });

  it('the landing page hero demo, which loops, has no live region', () => {
    const view = render(<TimerDemo />);
    expect(view.container.querySelectorAll('[aria-live]')).toHaveLength(0);
    expect(view.container.textContent).toContain('Get ready');
  });
});
