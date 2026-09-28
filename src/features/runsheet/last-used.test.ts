import { describe, expect, it } from 'vitest';
import { lastSet, lastSetLabel, lastSets, lastTimeLabel, lastUsed, withLastUsed } from './last-used';
import type { SessionResult } from './progression';
import type { Runsheet } from './model';

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
