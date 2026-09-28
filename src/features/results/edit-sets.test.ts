import { describe, expect, it } from 'vitest';
import type { SessionResult } from '@/features/runsheet/progression';
import type { Runsheet } from '@/features/runsheet/model';
import { addSet, editSet, plannedReps, removeSet, withRowLoad } from './edit-sets';
import { records } from './logbook';
import { lastUsed } from '@/features/runsheet/last-used';

const result = (): SessionResult => ({
  id: 's1',
  runsheetId: 'w',
  startedAt: '2026-09-01T10:00:00Z',
  steps: [
    { stepId: 'a', exerciseKey: 'bench', target: 60, reps: [8, 8], success: true, sets: [{ load: 40, reps: 10, type: 'warmup' }, { load: 60, reps: 8 }, { load: 60, reps: 8 }] },
    { stepId: 'r', exerciseKey: 'row', sets: [{ meters: 500, seconds: 110 }] },
    { stepId: 'o', exerciseKey: 'squat', target: 80, reps: [5, 5] },
  ],
});

describe('editing logged sets', () => {
  it('changes one set and works target and reps out again', () => {
    const r = editSet(result(), 'a|bench', 2, { load: 62.5, reps: 6 }, 8);
    expect(r.steps[0]).toMatchObject({ target: 62.5, reps: [8, 6], success: false });
    expect(r.steps[0].sets?.[2]).toEqual({ load: 62.5, reps: 6 });
    expect(records([r], 'bench').heaviest?.value).toBe(62.5);
  });
  it('a type goes on and comes off; a field set to undefined is removed', () => {
    let r = editSet(result(), 'a|bench', 0, { type: 'normal' });
    expect(r.steps[0].sets?.[0]).toEqual({ load: 40, reps: 10 });
    expect(r.steps[0].reps).toEqual([10, 8, 8]);
    r = editSet(r, 'r|row', 0, { seconds: undefined, meters: 480 });
    expect(r.steps[1].sets?.[0]).toEqual({ meters: 480 });
  });
  it('a row from before per-set results gets its sets written out', () => {
    const r = editSet(result(), 'o|squat', 1, { reps: 4 });
    expect(r.steps[2]).toMatchObject({ target: 80, reps: [5, 4], sets: [{ load: 80, reps: 5 }, { load: 80, reps: 4 }] });
  });
  it('reps edited below the plan make the row a miss, and back up to it a success', () => {
    const miss = editSet(result(), 'a|bench', 1, { reps: 6 }, 8);
    expect(miss.steps[0].success).toBe(false);
    expect(editSet(miss, 'a|bench', 1, { reps: 8 }, 8).steps[0].success).toBe(true);
    expect(editSet(result(), 'a|bench', 1, { load: 65 }, 8).steps[0].success).toBe(true);
  });
  it('without a plan, fewer reps than logged is a miss', () => {
    expect(editSet(result(), 'a|bench', 1, { reps: 7 }).steps[0].success).toBe(false);
    expect(editSet(result(), 'a|bench', 1, { reps: 9 }).steps[0].success).toBe(true);
    expect(editSet(result(), 'o|squat', 1, { reps: 4 }).steps[2].success).toBeUndefined();
  });
  it('an old rower row edited with its unit is saved with metres, not a load', () => {
    const old: SessionResult = { runsheetId: 'w', startedAt: '2026-09-01T10:00:00Z', steps: [{ stepId: 'r', exerciseKey: 'row', target: 500, sets: [{ load: 500 }] }] };
    expect(editSet(old, 'r|row', 0, { meters: 480 }, undefined, 'm').steps[0]).toEqual({ stepId: 'r', exerciseKey: 'row', sets: [{ meters: 480 }], reps: [] });
  });
  it('next session starts from the edited load', () => {
    const r = editSet(result(), 'a|bench', 2, { load: 65 });
    expect(lastUsed([r]).get('ex:bench')?.target).toBe(65);
  });
  it("the result sheet's load moves every set that was at it, not a warm-up's", () => {
    const row = withRowLoad(result().steps[0], 62.5);
    expect(row.sets?.map(x => x.load)).toEqual([40, 62.5, 62.5]);
    expect(row.target).toBe(62.5);
    expect(withRowLoad({ stepId: 'x', exerciseKey: 'x' }, 20)).toEqual({ stepId: 'x', exerciseKey: 'x', target: 20 });
  });
});

describe('plannedReps', () => {
  it('is the reps every set prescribes, and nothing for a ladder or a per-set plan', () => {
    const ex = { key: 'bench', name: 'Bench', unit: 'kg', step: 2.5 };
    const step = (id: string, extra = {}) => ({ kind: 'exercise' as const, id, exercise: ex, forMode: 'reps' as const, forValue: 5, ...extra });
    const r: Runsheet = { id: 'w', title: 'W', items: [step('a'), { kind: 'block' as const, id: 'b', name: 'B', repeat: 3, steps: [step('p', { sets: [{ reps: 5 }, { reps: 3 }] })] }, { kind: 'block' as const, id: 'l', name: 'L', repeat: 1, mode: 'ladder' as const, ladder: [5, 3], steps: [step('q')] }] };
    expect(plannedReps(r, 'a')).toBe(5);
    expect(plannedReps(r, 'p')).toBeUndefined();
    expect(plannedReps(r, 'q')).toBeUndefined();
    expect(plannedReps(undefined, 'a')).toBeUndefined();
  });
});

describe('adding and removing sets after the session', () => {
  it('a new set copies the last one, without its time or type', () => {
    const base = result();
    base.steps[0].sets![2] = { load: 60, reps: 8, at: 300, type: 'failure' };
    const r = addSet(base, 'a|bench');
    expect(r.steps[0].sets).toHaveLength(4);
    expect(r.steps[0].sets![3]).toEqual({ load: 60, reps: 8 });
    expect(r.steps[0].reps).toEqual([8, 8, 8]);
  });
  it('a row from before per-set results gets its sets written out, then one more', () => {
    const r = addSet(result(), 'o|squat');
    expect(r.steps[2]).toMatchObject({ target: 80, reps: [5, 5, 5], sets: [{ load: 80, reps: 5 }, { load: 80, reps: 5 }, { load: 80, reps: 5 }] });
  });
  it('removing a set works target and reps out again', () => {
    const r = removeSet(result(), 'a|bench', 2);
    expect(r.steps[0]).toMatchObject({ target: 60, reps: [8] });
    expect(r.steps[0].sets).toHaveLength(2);
    const w = removeSet(result(), 'a|bench', 0);
    expect(w.steps[0].reps).toEqual([8, 8]);
  });
  it('removing the only set drops the row', () => {
    const r = removeSet(result(), 'r|row', 0);
    expect(r.steps.map(s => s.exerciseKey)).toEqual(['bench', 'squat']);
  });
  it('a set added or taken off an old row counted in metres keeps the distance as metres', () => {
    const r: SessionResult = { runsheetId: 'w', startedAt: '2026-09-01T10:00:00Z', steps: [{ stepId: 'x', exerciseKey: 'row', target: 500, sets: [{ load: 500 }, { load: 500 }] }] };
    expect(addSet(r, 'x|row', 'm').steps[0].sets).toEqual([{ meters: 500 }, { meters: 500 }, { meters: 500 }]);
    expect(removeSet(r, 'x|row', 0, 'm').steps[0].sets).toEqual([{ meters: 500 }]);
  });
});
