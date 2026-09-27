import { describe, expect, it } from 'vitest';
import type { Runsheet } from '@/features/runsheet/model';
import type { SessionResult, SetResult } from '@/features/runsheet/progression';
import { FULL_LIBRARY } from '@/features/workouts/imported';
import { alternatives, convertLoad, patternOf } from '@/features/exercises/alternatives';
import { exerciseStall, plateau, workoutStall } from './stall';

const NOW = new Date('2026-09-27T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 864e5).toISOString();
const kb = { key: 'kb_goblet_squat', name: 'Goblet squat', unit: 'kg', step: 4 };
const did = (d: number, key: string, sets: SetResult[]): SessionResult => ({ id: `r${d}`, runsheetId: 'w', startedAt: daysAgo(d), steps: [{ stepId: 'a', exerciseKey: key, sets }] });
const x = (load: number | undefined, reps: number): SetResult => ({ reps, ...(load !== undefined ? { load } : {}) });

describe('plateau', () => {
  const pts = (...vs: [number, number][]) => vs.map(([d, value]) => ({ at: daysAgo(d), value }));

  it('is the record session and three or more after it, three weeks apart', () => {
    const p = plateau(pts([42, 28], [35, 30], [28, 30], [21, 29], [14, 30]), NOW)!;
    expect(p).toMatchObject({ sessions: 4, weeks: 5, index: 1 });
  });

  it('a tie is not progress, a new best resets it', () => {
    expect(plateau(pts([35, 30], [28, 30], [21, 30], [7, 31]), NOW)).toBeUndefined();
  });

  it('needs the sessions, the weeks and a recent session', () => {
    expect(plateau(pts([35, 30], [28, 29], [21, 29]), NOW)).toBeUndefined();
    expect(plateau(pts([14, 30], [10, 29], [7, 29], [3, 29]), NOW)).toBeUndefined();
    expect(plateau(pts([90, 30], [80, 29], [70, 29], [60, 29]), NOW)).toBeUndefined();
  });

  it('reads lower as better for a time', () => {
    expect(plateau(pts([35, 700], [28, 710], [21, 705], [14, 701]), NOW, true)).toMatchObject({ sessions: 4 });
  });
});

describe('exercise stalls', () => {
  const stuck = [did(35, kb.key, [x(24, 8), x(24, 8)]), did(28, kb.key, [x(24, 8), x(24, 7)]), did(21, kb.key, [x(24, 7)]), did(14, kb.key, [x(24, 8)])];

  it('names the best that stands and offers two ways out', () => {
    const s = exerciseStall(stuck, kb, NOW, load => ({ key: 'db_squat', name: 'Dumbbell squat', target: load! / 2, unit: 'kg' }))!;
    expect(s.line).toBe('At 24 kg × 8 for 5 weeks');
    expect(s.options.map(o => o.title)).toEqual(['Drop to 20 kg and build to 12 reps', 'Swap to Dumbbell squat for three weeks']);
    expect(s.options[1]).toMatchObject({ exerciseKey: 'db_squat', detail: 'Start around 12 kg. Then come back to Goblet squat.' });
    expect(s.id).toBe(`x:${kb.key}@${daysAgo(35)}`);
  });

  it('without an alternative the second way out is heavier for fewer reps', () => {
    expect(exerciseStall(stuck, kb, NOW)!.options[1].title).toBe('Go heavier for three weeks: 28 kg × 5');
  });

  it('banking reps past 10 is progress, not a stall', () => {
    const banking = [did(35, kb.key, [x(24, 10)]), did(28, kb.key, [x(24, 11)]), did(21, kb.key, [x(24, 12)]), did(14, kb.key, [x(24, 13)])];
    expect(exerciseStall(banking, kb, NOW)).toBeUndefined();
  });

  it('bodyweight stalls on reps', () => {
    const pu = { key: 'bw_pushup', name: 'Push-ups', unit: '', step: 1 };
    const s = exerciseStall([did(35, pu.key, [x(undefined, 20)]), did(28, pu.key, [x(undefined, 18)]), did(21, pu.key, [x(undefined, 20)]), did(14, pu.key, [x(undefined, 19)])], pu, NOW)!;
    expect(s.line).toBe('At 20 reps for 5 weeks');
    expect(s.options[0].title).toBe('Do 5 sets of 12 for three weeks');
  });
});

describe('prescribed counts', () => {
  it('bodyweight reps that never vary are a circuit’s count, not a stall', () => {
    const pu = { key: 'bw_pushup', name: 'Push-ups', unit: '', step: 1 };
    const same = [35, 28, 21, 14].map(d => did(d, pu.key, [x(undefined, 10), x(undefined, 10)]));
    expect(exerciseStall(same, pu, NOW)).toBeUndefined();
  });
});

describe('workout stalls', () => {
  const amrap: Runsheet = { id: 'cindy', title: 'Cindy', items: [{ kind: 'block', id: 'b', name: 'AMRAP', repeat: 1, mode: 'amrap', timeCapSec: 1200, steps: [] }] };
  const score = (d: number, s: number): SessionResult => ({ id: `c${d}`, runsheetId: 'cindy', startedAt: daysAgo(d), score: s, steps: [] });

  it('rounds that stopped going up get an even pace and a break', () => {
    const s = workoutStall(amrap, [score(35, 14), score(28, 14), score(21, 13.01), score(14, 14)], NOW)!;
    expect(s.line).toBe('At 14 rounds for 5 weeks');
    expect(s.options[0].title).toBe('Even pace: 1:20 a round');
    expect(s.options[1].title).toMatch(/^Park it for three weeks, retest on /);
  });
});

describe('alternatives, ported from Alternatives.swift', () => {
  it('reads the movement and converts the load', () => {
    expect(patternOf(FULL_LIBRARY.kb_swing)).toBe('hinge');
    expect(patternOf(FULL_LIBRARY.cardio_rower)).toBe('cardio');
    expect(convertLoad(20, FULL_LIBRARY.db_bench, FULL_LIBRARY.machine_chest_press)).toBe(45);
    expect(convertLoad(20, FULL_LIBRARY.db_bench, FULL_LIBRARY.bw_pushup)).toBeUndefined();
    const keys = alternatives('db_bench', 20, FULL_LIBRARY, 8).map(a => a.exercise.key);
    expect(keys).toContain('machine_chest_press');
    expect(keys).not.toContain('db_bench');
  });
});
