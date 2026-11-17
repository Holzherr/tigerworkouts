import { describe, expect, it } from 'vitest';
import { makeExercise, makeRest, type Runsheet } from '@/features/runsheet/model';
import { LIBRARY } from '@/features/exercises/library';
import * as R from '@/features/timer/runner';
import { adjustable, nudge } from '../widget/adjust';

const sheet: Runsheet = { id: 'w', title: 'W', items: [{ ...makeExercise(LIBRARY.bb_bench, { forMode: 'reps', forValue: 8, target: 60 }), id: 'b' }, { ...makeRest(60), id: 'r' }, { ...makeExercise(LIBRARY.bw_pushup, { forMode: 'reps', forValue: 10 }), id: 'p' }] };
const running = () => {
  let s = R.start(sheet, 0);
  while (s.phase === 'lead') s = R.tick(s, (s.endsAt ?? 0) + 1);
  return s;
};

describe('chat timer steppers (review round 2 U15)', () => {
  it('offer load and reps on a loaded set, none in the lead-in', () => {
    expect(adjustable(R.start(sheet, 0))).toBeUndefined();
    expect(adjustable(running())).toEqual({ load: { value: 60, step: 2.5, unit: 'kg' }, reps: 8 });
  });
  it('change what the session logs, not the plan', () => {
    const t = Date.now();
    let s = running();
    s = nudge(s, t, 'load', 1);
    s = nudge(s, t, 'reps', -1);
    s = nudge(s, t, 'reps', -1);
    expect(adjustable(s)).toMatchObject({ load: { value: 62.5 }, reps: 6 });
    const set = R.toResult(R.finish(R.advance(s, t), t), sheet, t).steps.find(x => x.exerciseKey === 'bb_bench')!;
    expect(set.sets?.[0]).toMatchObject({ reps: 6, load: 62.5 });
  });
  it('offers only reps on a bodyweight set, and never goes below zero', () => {
    let s = running();
    s = R.advance(s, Date.now());
    while (R.current(s)?.kind === 'rest') s = R.advance(s, Date.now());
    expect(adjustable(s)).toEqual({ load: undefined, reps: 10 });
    for (let i = 0; i < 12; i++) s = nudge(s, Date.now(), 'reps', -1);
    expect(adjustable(s)?.reps).toBe(0);
  });
});

describe('chat timer in lb (U11)', () => {
  it('steps the load in lb and keeps it in kg', async () => {
    const { setWeightUnit } = await import('@/shared/utils/units');
    setWeightUnit('lb');
    try {
      const s = nudge(running(), Date.now(), 'load', 1);
      // 60 kg is 132.3 lb; one press goes to 135 lb, kept as 61.235 kg.
      expect(adjustable(s)?.load?.value).toBe(61.235);
    } finally {
      setWeightUnit('kg');
    }
  });
});
