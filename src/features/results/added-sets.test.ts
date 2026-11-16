import { describe, expect, it } from 'vitest';
import type { Runsheet } from '@/features/runsheet/model';
import { addedSets, withAddedSets } from './added-sets';

const bench = { kind: 'exercise' as const, id: 'b1', exercise: { key: 'bb_bench', name: 'Bench', unit: 'kg', step: 2.5 }, forMode: 'reps' as const, forValue: 8, target: 60 };
const r: Runsheet = { id: 'w', title: 'Push', items: [{ kind: 'block', id: 'B', name: 'Bench', repeat: 3, steps: [bench] }] };
const sets = (n: number) => Array.from({ length: n }, () => ({ load: 60, reps: 8 }));

describe('sets added with + Add set', () => {
  it('counts the sets logged beyond the block and puts them on the workout', () => {
    const added = addedSets(r, { steps: [{ stepId: 'b1', exerciseKey: 'bb_bench', sets: sets(4) }] });
    expect(added).toEqual({ B: 1 });
    expect((withAddedSets(r, added).items[0] as { repeat: number }).repeat).toBe(4);
  });
  it('says nothing when the sets were as written or fewer', () => {
    expect(addedSets(r, { steps: [{ stepId: 'b1', exerciseKey: 'bb_bench', sets: sets(3) }] })).toEqual({});
    expect(addedSets(r, { steps: [{ stepId: 'b1', exerciseKey: 'bb_bench', sets: sets(2) }] })).toEqual({});
  });
});
