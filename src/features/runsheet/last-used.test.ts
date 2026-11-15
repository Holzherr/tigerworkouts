import { describe, expect, it } from 'vitest';
import { compactSets, lastSessionLabel, lastSessionSet, lastSet, lastSetLabel, lastSets, lastTimeLabel, lastUsed, seededSets, withLastUsed } from './last-used';
import type { SessionResult, SetResult } from './progression';
import { makeExercise, type Block, type ExerciseStep, type Runsheet } from './model';
import { EX } from './fixtures';

const sprint = { key: 'sprint', name: 'Treadmill sprints', unit: 'kph', step: 0.5 };
const press = { key: 'db_incline_press', name: 'Incline chest press', unit: 'kg per arm', step: 2.5 };

const sheet = (): Runsheet => ({
  id: 'u-1',
  title: 'Swings & sprints',
  items: [
    { kind: 'block', id: 'b1', name: 'Sprints', repeat: 8, steps: [{ kind: 'exercise', id: 'e1', exercise: sprint, target: 14.5, forMode: 'seconds', forValue: 30 }, { kind: 'rest', id: 'r1', seconds: 30 }] },
    { kind: 'exercise', id: 'e2', exercise: press, target: 15, forMode: 'seconds', forValue: 30 },
  ],
});

const session = (startedAt: string, steps: SessionResult['steps']): SessionResult => ({ id: 's-' + startedAt, runsheetId: 'u-1', startedAt, steps });

describe('what you used last time', () => {
  it('prefers the newest session', () => {
    const m = lastUsed([
      session('2026-09-01T10:00:00Z', [{ stepId: 'e1', exerciseKey: 'sprint', target: 13 }]),
      session('2026-09-10T10:00:00Z', [{ stepId: 'e1', exerciseKey: 'sprint', target: 14.5, incline: 6 }]),
    ], sheet());
    expect(m.get('step:e1')).toEqual({ target: 14.5, incline: 6, exerciseKey: 'sprint' });
  });

  it('seeds a lift written with no load, and leaves a % of training max to the resolver', () => {
    const squat = { key: 'bb_back_squat', name: 'Barbell back squat', unit: 'kg', step: 2.5 };
    const r: Runsheet = { id: 'p-1', title: '5×5', items: [{ kind: 'exercise', id: 's1', exercise: squat, forMode: 'reps', forValue: 5 }, { kind: 'exercise', id: 's2', exercise: squat, targetPct: 65, forMode: 'reps', forValue: 5 }] };
    const out = withLastUsed(r, [{ id: 's-1', runsheetId: 'p-1', startedAt: '2026-11-14T10:00:00Z', steps: [{ stepId: 's1', exerciseKey: 'bb_back_squat', target: 40 }] }]);
    expect(out.items.map(i => (i.kind === 'exercise' ? i.target : null))).toEqual([40, undefined]);
  });

  it('seeds speed, incline and weight into the workout', () => {
    const out = withLastUsed(sheet(), [session('2026-09-10T10:00:00Z', [
      { stepId: 'e1', exerciseKey: 'sprint', target: 15, incline: 6 },
      { stepId: 'e2', exerciseKey: 'db_incline_press', target: 20 },
    ])]);
    const block = out.items[0] as Extract<Runsheet['items'][number], { kind: 'block' }>;
    expect(block.steps[0]).toMatchObject({ target: 15, incline: 6 });
    expect(out.items[1]).toMatchObject({ target: 20 });
  });

  it('carries a machine across workouts by exercise when the step id is new', () => {
    const out = withLastUsed(sheet(), [session('2026-09-10T10:00:00Z', [{ stepId: 'somewhere-else', exerciseKey: 'sprint', target: 15.5, incline: 5 }])]);
    const block = out.items[0] as Extract<Runsheet['items'][number], { kind: 'block' }>;
    expect(block.steps[0]).toMatchObject({ target: 15.5, incline: 5 });
  });

  it('leaves the workout alone with no history', () => {
    const r = sheet();
    expect(withLastUsed(r, [])).toBe(r);
  });

  it('does not touch a percentage-of-training-max load', () => {
    const r = sheet();
    (r.items[1] as { target?: unknown }).target = { pct: 80 };
    const out = withLastUsed(r, [session('2026-09-10T10:00:00Z', [{ stepId: 'e2', exerciseKey: 'db_incline_press', target: 60 }])]);
    expect((out.items[1] as { target?: unknown }).target).toEqual({ pct: 80 });
  });

  // Step ids are per workout: "s1" is a step in hundreds of catalogue workouts.
  it('does not carry a step id over from another workout', () => {
    const other: SessionResult = { runsheetId: 'u-other', startedAt: '2026-09-12T10:00:00Z', steps: [{ stepId: 'e1', exerciseKey: 'db_incline_press', target: 40, incline: 3 }] };
    const out = withLastUsed(sheet(), [other, session('2026-09-10T10:00:00Z', [{ stepId: 'x', exerciseKey: 'sprint', target: 15.5, incline: 5 }])]);
    const block = out.items[0] as Extract<Runsheet['items'][number], { kind: 'block' }>;
    expect(block.steps[0]).toMatchObject({ target: 15.5, incline: 5 });
    expect(lastUsed([other], sheet()).has('step:e1')).toBe(false);
  });

  it('an edited copy starts on the numbers logged against the original', () => {
    const copy: Runsheet = { ...sheet(), id: 'u-copy', copyOf: 'u-1' };
    const out = withLastUsed(copy, [
      session('2026-09-10T10:00:00Z', [{ stepId: 'e1', exerciseKey: 'sprint', target: 16, incline: 4 }]),
      { runsheetId: 'u-other', startedAt: '2026-09-12T10:00:00Z', steps: [{ stepId: 'z', exerciseKey: 'sprint', target: 12 }] },
    ]);
    const block = out.items[0] as Extract<Runsheet['items'][number], { kind: 'block' }>;
    expect(block.steps[0]).toMatchObject({ target: 16, incline: 4 });
  });

  it('ignores a step whose id now holds another exercise', () => {
    const out = withLastUsed(sheet(), [
      session('2026-09-12T10:00:00Z', [{ stepId: 'e2', exerciseKey: 'bb_bench_press', target: 80 }]),
      { runsheetId: 'u-other', startedAt: '2026-09-01T10:00:00Z', steps: [{ stepId: 'z', exerciseKey: 'db_incline_press', target: 22.5 }] },
    ]);
    expect(out.items[1]).toMatchObject({ target: 22.5 });
  });
});

describe('last time, on the row', () => {
  const bench = { kind: 'exercise' as const, id: 'e2', exercise: press, target: 15, forMode: 'reps' as const, forValue: 8 };

  it('shows the heaviest set of the newest session', () => {
    const set = lastSet([
      session('2026-09-01T10:00:00Z', [{ stepId: 'e2', exerciseKey: press.key, sets: [{ load: 60, reps: 8 }] }]),
      session('2026-09-10T10:00:00Z', [{ stepId: 'e2', exerciseKey: press.key, sets: [{ load: 55, reps: 8 }, { load: 57.5, reps: 8 }, { load: 57.5, reps: 6 }] }]),
    ], bench, sheet());
    expect(lastTimeLabel(set, bench)).toBe('last time 57.5 × 8');
  });

  it('reads the step of this workout first, not the same step id of another', () => {
    const results: SessionResult[] = [
      session('2026-09-01T10:00:00Z', [{ stepId: 'zz', exerciseKey: press.key, sets: [{ load: 50, reps: 8 }] }]),
      session('2026-09-03T10:00:00Z', [{ stepId: 'e2', exerciseKey: press.key, sets: [{ load: 60, reps: 8 }] }]),
      { runsheetId: 'u-other', startedAt: '2026-09-05T10:00:00Z', steps: [{ stepId: 'e2', exerciseKey: press.key, sets: [{ load: 30, reps: 12 }] }] },
    ];
    expect(lastSet(results, bench, sheet())).toEqual({ load: 60, reps: 8 });
    expect(lastSets(results, bench, sheet())).toEqual([{ load: 60, reps: 8 }]);
    // Another workout has no step history of its own here, so it gets the exercise's newest.
    expect(lastSet(results, bench, { id: 'u-third', title: 'Third' })).toEqual({ load: 30, reps: 12 });
    // An edited copy reads the original's step.
    expect(lastSet(results, bench, { id: 'u-copy', title: 'Copy', copyOf: 'u-1' })).toEqual({ load: 60, reps: 8 });
  });

  it('falls back to the same exercise in another workout, and to results logged before sets', () => {
    const set = lastSet([{ id: 'x', runsheetId: 'other', startedAt: '2026-09-02T10:00:00Z', steps: [{ stepId: 'zz', exerciseKey: press.key, target: 20, reps: [8, 10] }] }], bench);
    expect(lastTimeLabel(set, bench)).toBe('last time 20 × 10');
  });

  it('says nothing when there is no history', () => {
    expect(lastTimeLabel(lastSet([], bench), bench)).toBeUndefined();
  });
});

describe('last time, per set', () => {
  it('reads the newest session with sets for this step, else the exercise anywhere', () => {
    const step = { kind: 'exercise', id: 'pr', exercise: { key: 'db_incline_press', name: 'Press', unit: 'kg', step: 2.5 }, forMode: 'reps', forValue: 8 } as const;
    const res = (at: string, stepId: string, sets: { reps?: number; load?: number }[]): SessionResult => ({ runsheetId: 'x', startedAt: at, steps: [{ stepId, exerciseKey: 'db_incline_press', sets }] });
    const w = { id: 'x', title: 'X' };
    expect(lastSets([res('2026-09-01', 'pr', [{ reps: 8, load: 20 }]), res('2026-09-02', 'other', [{ reps: 5, load: 30 }])], step, w)).toEqual([{ reps: 8, load: 20 }]);
    expect(lastSets([res('2026-09-02', 'other', [{ reps: 5, load: 30 }])], step)).toEqual([{ reps: 5, load: 30 }]);
    expect(lastSets([], step)).toBeUndefined();
    expect(lastSetLabel({ reps: 8, load: 57.5 })).toBe('last 57.5 × 8');
    expect(lastSetLabel({ reps: 8 })).toBe('last 8');
    expect(lastSetLabel({})).toBeUndefined();
  });
});

describe('last time, per set, on an exercise counted in a measure', () => {
  it('reads a legacy row that logged metres as a load as metres, so nothing offers the metres as a load', () => {
    const row = { kind: 'exercise', id: 'row', exercise: { key: 'cardio_rower', name: 'Rowing machine', unit: 'm', step: 100 }, forMode: 'meters', forValue: 1000 } as const;
    const res: SessionResult = { runsheetId: 'x', startedAt: '2026-09-01', steps: [{ stepId: 'row', exerciseKey: 'cardio_rower', sets: [{ load: 500 }] }] };
    expect(lastSets([res], row)).toEqual([{ meters: 500 }]);
    expect(lastSetLabel(lastSets([res], row)?.[0])).toBeUndefined();
  });
});

describe('last time, set by set (Priyanka, 15 Nov 2026)', () => {
  const lift = { ...makeExercise(EX.bb_bench, { target: 100, forMode: 'reps', forValue: 8 }), id: 'b1' };
  const w: Runsheet = { id: 'u-w', title: 'Push', items: [{ kind: 'block', id: 'blk', name: 'Bench', repeat: 3, mode: 'rounds', steps: [lift] }] };
  const row = (sets: [number, number][], stepId = 'b1') => ({ stepId, exerciseKey: lift.exercise.key, target: sets[0][0], reps: sets.map(x => x[1]), sets: sets.map(([load, reps]) => ({ load, reps })) });
  const done = (id: string, at: string, sets: [number, number][], runsheetId = 'u-w', stepId = 'b1'): SessionResult => ({ id, runsheetId, startedAt: at, steps: [row(sets, stepId)] });

  it('reads the last session in order, never the heaviest set', () => {
    const results = [done('a', '2026-11-01T10:00:00Z', [[120, 1]]), done('b', '2026-11-08T10:00:00Z', [[100, 8], [110, 4], [110, 4]])];
    expect(lastSessionLabel(results, lift, w)).toBe('last time 100 × 8, 110 × 4 (×2)');
    expect(lastSessionSet(results, lift, 0, w)).toEqual({ load: 100, reps: 8 });
    expect(lastSessionSet(results, lift, 1, w)).toEqual({ load: 110, reps: 4 });
    // Past the end: the last set.
    expect(lastSessionSet(results, lift, 7, w)).toEqual({ load: 110, reps: 4 });
  });
  it('takes the same step of this workout first, else the same exercise', () => {
    const results = [done('mine', '2026-11-01T10:00:00Z', [[60, 8]]), done('other', '2026-11-09T10:00:00Z', [[30, 12]], 'u-other', 'zz')];
    expect(lastSessionLabel(results, lift, w)).toBe('last time 60 × 8');
    expect(lastSessionLabel(results, lift, { id: 'u-third', title: 'Third' })).toBe('last time 30 × 12');
    expect(lastSessionLabel(results, lift)).toBe('last time 30 × 12');
  });
  it('writes sets alike once, reps without a load, and stops at four groups', () => {
    expect(compactSets([{ load: 100, reps: 8 }, { load: 100, reps: 8 }, { load: 100, reps: 8 }])).toBe('100 × 8 (×3)');
    expect(compactSets([{ reps: 12 }, { reps: 12 }, { reps: 10 }])).toBe('12 (×2), 10 reps');
    expect(compactSets([{ load: 10 }], 'kph')).toBe('10 kph');
    expect(compactSets([1, 2, 3, 4, 5, 6].map(n => ({ load: n * 10, reps: 5 })))).toBe('10 × 5, 20 × 5, 30 × 5, 40 × 5 +2 more');
    expect(compactSets([])).toBeUndefined();
  });
  it('a row from before sets were kept stands in with its reps at its one load', () => {
    const old: SessionResult = { id: 'o', runsheetId: 'u-w', startedAt: '2026-08-01T10:00:00Z', steps: [{ stepId: 'b1', exerciseKey: lift.exercise.key, target: 50, reps: [8, 7] }] };
    expect(lastSessionLabel([old], lift, w)).toBe('last time 50 × 8, 50 × 7');
  });
  it('starts each set on its own set last time, so a pyramid carries over', () => {
    const run = withLastUsed(w, [done('b', '2026-11-08T10:00:00Z', [[100, 8], [110, 4], [110, 4]])]);
    const step = (run.items[0] as Block).steps[0] as ExerciseStep;
    expect(step.sets?.map(x => x.load)).toEqual([100, 110, 110]);
    expect(step.target).toBe(100);
  });
  it("starts sets that were all one load on today's target when it moves them", () => {
    const results = [done('b', '2026-11-08T10:00:00Z', [[100, 8], [100, 8], [100, 8]])];
    const run = withLastUsed(w, results, [{ stepId: 'b1', exerciseKey: lift.exercise.key, load: 102.5 }]);
    expect(((run.items[0] as Block).steps[0] as ExerciseStep).sets?.map(x => x.load)).toEqual([102.5, 102.5, 102.5]);
    // A pyramid is left as it was done, whatever the target says.
    const pyramid = withLastUsed(w, [done('b', '2026-11-08T10:00:00Z', [[100, 8], [110, 4], [110, 4]])], [{ stepId: 'b1', exerciseKey: lift.exercise.key, load: 112.5 }]);
    expect(((pyramid.items[0] as Block).steps[0] as ExerciseStep).sets?.map(x => x.load)).toEqual([100, 110, 110]);
  });
  it('past last time\'s sets, a new set takes the set before\'s load; a warm-up keeps its type', () => {
    const last: SetResult[] = [{ load: 40, reps: 10, type: 'warmup' }, { load: 100, reps: 8 }];
    expect(seededSets(lift, 3, last, undefined)).toEqual([{ load: 40, type: 'warmup' }, { load: 100 }, { load: 100 }]);
    expect(seededSets(lift, 3, last, 105)).toEqual([{ load: 40, type: 'warmup' }, { load: 105 }, { load: 105 }]);
  });
});
