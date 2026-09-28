import { describe, expect, it } from 'vitest';
import type { SessionResult } from '@/features/runsheet/progression';
import { addSet, editSet, removeSet, withRowLoad } from './edit-sets';
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
    const r = editSet(result(), 'a|bench', 2, { load: 62.5, reps: 6 });
    expect(r.steps[0]).toMatchObject({ target: 62.5, reps: [8, 6], success: true });
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
});
