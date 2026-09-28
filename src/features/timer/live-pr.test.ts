import { describe, expect, it } from 'vitest';
import { EX } from '@/features/runsheet/fixtures';
import { makeExercise, type Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import * as R from './runner';
import { newRecords } from './live-pr';

const press = EX.db_incline_press;
const sheet = (load: number): Runsheet => ({ id: 'w', title: 'Press', items: [{ kind: 'block', id: 'b', name: 'Press', repeat: 3, restBetweenSec: 60, steps: [{ ...makeExercise(press, { forMode: 'reps', forValue: 5, target: load }), id: 'p' }] }] });
const past: SessionResult[] = [{ id: 'old', runsheetId: 'w', startedAt: '2026-09-01T10:00:00Z', steps: [{ stepId: 'p', exerciseKey: press.key, target: 20, reps: [5], sets: [{ load: 20, reps: 5 }] }] }];

const run = (load: number) => {
  const r = sheet(load);
  let s = R.tick(R.start(r, 0), 60_000);
  const works = s.slots.filter(sl => sl.kind === 'work');
  return { r, s, works };
};

describe('a PR the moment a set is ticked', () => {
  it('the first set over the old best is a PR; the second at the same load is not', () => {
    const { r, s, works } = run(22);
    const one = R.completeSet(s, 70_000, works[0].id);
    expect(newRecords(s, one, r, past, 70_000).map(p => p.slotId)).toEqual([works[0].id]);
    const two = R.completeSet(one, 150_000, works[1].id);
    expect(newRecords(one, two, r, past, 150_000)).toEqual([]);
  });
  it('a set at the old best is not a PR, and nothing is in the first session of an exercise', () => {
    const { r, s, works } = run(20);
    const one = R.completeSet(s, 70_000, works[0].id);
    expect(newRecords(s, one, r, past, 70_000)).toEqual([]);
    const heavy = run(40);
    const first = R.completeSet(heavy.s, 70_000, heavy.works[0].id);
    expect(newRecords(heavy.s, first, heavy.r, [], 70_000)).toEqual([]);
  });
  it('a warm-up over the old best is not a PR', () => {
    const { r, s, works } = run(22);
    const warm = R.setTypeAt(s, works[0].id, 'warmup');
    const one = R.completeSet(warm, 70_000, works[0].id);
    expect(newRecords(warm, one, r, past, 70_000)).toEqual([]);
  });
});
