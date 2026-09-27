import { describe, expect, it } from 'vitest';
import { makeExercise, type Block, type ExerciseRef, type Runsheet } from './model';
import { kitLoads, kitOf, nextLoadUp, plateText, platesFor, snapToKit, type Equipment } from './plates';
import { nextLoads, resolveLoads, resolveTarget } from './progression';
import { setTarget } from './targets';
import { convertLoad } from '@/features/exercises/alternatives';
import { LIBRARY } from '@/features/exercises/library';

const KB: ExerciseRef = { key: 'kb_goblet_squat', name: 'Kettlebell goblet squat', unit: 'kg', step: 4 };
const BENCH: ExerciseRef = { key: 'bb_bench', name: 'Barbell bench press', unit: 'kg', step: 2.5 };
const DB: ExerciseRef = { key: 'db_bench', name: 'Dumbbell bench press', unit: 'kg per arm', step: 2.5 };
const home: Equipment = { barKg: 20, plates: [{ kg: 20, count: 2 }, { kg: 10, count: 2 }, { kg: 5, count: 2 }, { kg: 2.5, count: 2 }], dumbbells: [10, 12.5, 15, 20], kettlebells: [12, 16, 24, 32] };

describe('which kit', () => {
  it('reads the key, then the group', () => {
    expect(kitOf(BENCH)).toBe('barbell');
    expect(kitOf(KB)).toBe('kettlebell');
    expect(kitOf(DB)).toBe('dumbbell');
    expect(kitOf({ key: 'lat_raise', group: 'dumbbell' })).toBe('dumbbell');
    expect(kitOf({ key: 'machine_leg_press' })).toBeUndefined();
  });
});

describe('loads you can make', () => {
  it('a bar is the bar plus a pair of each plate', () => {
    expect(kitLoads('barbell', home)).toEqual([20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95]);
  });
  it('kettlebells default to 4 kg steps', () => {
    expect(kitLoads('kettlebell', undefined)?.slice(0, 7)).toEqual([4, 8, 12, 16, 20, 24, 28]);
  });
  it('a kit left unset is no constraint', () => {
    expect(kitLoads('barbell', {})).toBeUndefined();
    expect(kitLoads('dumbbell', {})).toBeUndefined();
  });
  it('snaps nearest, up and down', () => {
    expect(snapToKit(43, BENCH, home)).toBe(45);
    expect(snapToKit(42.5, BENCH, home)).toBe(40);
    expect(snapToKit(41, BENCH, home, 'up')).toBe(45);
    expect(snapToKit(44, BENCH, home, 'down')).toBe(40);
    expect(snapToKit(26.5, KB, home, 'up')).toBe(32);
    expect(snapToKit(26.5, KB, undefined, 'up')).toBe(28);
    expect(snapToKit(14, DB, home)).toBe(15);
    expect(snapToKit(61.3, BENCH, undefined)).toBe(62.5);
    expect(snapToKit(200, BENCH, home)).toBe(95);
  });
  it('the next load up, or none past the heaviest', () => {
    expect(nextLoadUp(24, KB, home)).toBe(32);
    expect(nextLoadUp(32, KB, home)).toBeUndefined();
    expect(nextLoadUp(60, BENCH, undefined)).toBe(62.5);
  });
});

describe('plate calculator', () => {
  it('plates per side, heaviest first', () => {
    const p = platesFor(65, home);
    expect(p).toEqual({ bar: 20, perSide: [20, 2.5], total: 65, exact: true });
    expect(plateText(p)).toBe('20 kg bar + 20 + 2.5 per side');
    expect(plateText(platesFor(100))).toBe('20 kg bar + 2×20 per side');
    expect(plateText(platesFor(20, home))).toBe('20 kg bar, no plates');
  });
  it('the closest it can make when it cannot', () => {
    const p = platesFor(67, home);
    expect(p.exact).toBe(false);
    expect(p.total).toBe(65);
  });
});

describe('suggested loads snap to what you own', () => {
  const rule = (ex: ExerciseRef, target: number): Runsheet => {
    const b: Block = { kind: 'block', id: 'b', name: 'B', repeat: 3, steps: [{ ...makeExercise(ex, { forMode: 'reps', forValue: 8, target }), id: 's' }], progression: { onSuccessKg: 2.5 } };
    return { id: 'p', title: 'P', items: [b] };
  };
  it('a 24 kg kettlebell goes to the next bell, not 27.5', () => {
    const r = rule({ ...KB, step: 2.5 }, 24);
    const done = { runsheetId: 'p', startedAt: '2026-09-27', steps: [{ stepId: 's', exerciseKey: KB.key, target: 24, success: true }] };
    expect(nextLoads(r, done)[0].to).toBe(28);
    expect(nextLoads(r, done, [], {}, home)[0].to).toBe(32);
  });
  it('a % of a training max resolves to a load the plates make', () => {
    const s = { ...makeExercise(BENCH, { forMode: 'reps', forValue: 5 }), targetPct: 65 };
    expect(resolveTarget(s, { bb_bench: 100 }, undefined, home)).toBe(65);
    expect(resolveTarget(s, { bb_bench: 90 }, undefined, home)).toBe(60);
    const r = resolveLoads({ title: 't', items: [s] }, { bb_bench: 90 }, undefined, home);
    expect(r.items[0]).toMatchObject({ target: 60, targetPct: 65 });
  });
  it('the target load jump is the next load owned', () => {
    const s = { ...makeExercise(KB, { forMode: 'reps', forValue: 8 }), forMax: 12 };
    const t = setTarget(s, [{ load: 24, reps: 12 }, { load: 24, reps: 12 }], 'maintain', home);
    expect(t?.load).toBe(32);
    expect(t?.jump).toBe(true);
    const top = setTarget(s, [{ load: 32, reps: 12 }], 'maintain', home);
    expect(top?.jump).toBe(false);
    expect(top?.reason).toMatch(/heaviest you own/);
  });
  it('a converted swap lands on a dumbbell you have', () => {
    expect(convertLoad(40, LIBRARY.bb_bench, LIBRARY.db_bench, home)).toBe(20);
    expect(convertLoad(30, LIBRARY.bb_bench, LIBRARY.db_bench, home)).toBe(12.5);
    expect(convertLoad(60, LIBRARY.bb_bench, LIBRARY.db_bench, home)).toBe(20);
    expect(convertLoad(60, LIBRARY.bb_bench, LIBRARY.db_bench)).toBe(27.5);
  });
});
