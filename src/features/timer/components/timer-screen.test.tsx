import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { EX } from '@/features/runsheet/fixtures';
import { makeExercise, type Runsheet } from '@/features/runsheet/model';
import * as R from '../runner';
import { TimerScreen } from './timer-screen';

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
