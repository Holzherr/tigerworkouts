import { describe, expect, it } from 'vitest';
import { editRun, editSet, makeExercise, makeRest, plannedSet, setRuns, straightSetStep, type Block, type ExerciseRef } from './model';

// The same cases as SetRunTests in ios/TigerWorkoutsTests/EditingTests.swift.
const PRESS: ExerciseRef = { key: 'db_incline_press', name: 'Incline chest press', unit: 'kg per arm', step: 2.5 };
const sets = (repeat: number): Block => ({ kind: 'block', id: 'b', name: 'Press', repeat, steps: [{ ...makeExercise(PRESS, { target: 20, forMode: 'seconds', forValue: 30 }), id: 'pr' }, { ...makeRest(60), id: 'r' }] });

describe('set runs', () => {
  it('folds 8 identical sets into one run, and a stepper on it changes all 8', () => {
    expect(setRuns(sets(8))).toEqual([{ from: 0, count: 8, type: 'normal', reps: 30, load: 20 }]);
    const b = editRun(sets(8), setRuns(sets(8))[0], { load: 22.5 });
    expect(Array.from({ length: 8 }, (_, i) => plannedSet(straightSetStep(b)!, i).load)).toEqual(Array(8).fill(22.5));
    expect(setRuns(b)).toHaveLength(1);
  });

  it('splits a warm-up and 4 working sets into two runs', () => {
    const b = editSet(sets(5), 0, { load: 40, reps: 12, type: 'warmup' });
    expect(setRuns(b)).toEqual([
      { from: 0, count: 1, type: 'warmup', reps: 12, load: 40 },
      { from: 1, count: 4, type: 'normal', reps: 30, load: 20 },
    ]);
    const c = editRun(b, setRuns(b)[1], { reps: 8 });
    expect(setRuns(c).map(r => [r.count, r.reps])).toEqual([[1, 12], [4, 8]]);
  });

  it('a set that differs in the middle splits the run around it; making it alike folds it back', () => {
    const b = editSet(sets(4), 2, { load: 25 });
    expect(setRuns(b).map(r => [r.from, r.count, r.load])).toEqual([[0, 2, 20], [2, 1, 25], [3, 1, 20]]);
    expect(setRuns(editSet(b, 2, { load: 20 }))).toHaveLength(1);
  });

  it('is empty for a block that is not straight sets', () => {
    expect(setRuns({ ...sets(3), mode: 'amrap' })).toEqual([]);
  });
});
