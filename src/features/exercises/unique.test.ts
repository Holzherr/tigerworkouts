import { describe, expect, it } from 'vitest';
import { FULL_LIBRARY } from '@/features/workouts/imported';
import { alternatives } from './alternatives';
import type { LibraryExercise } from './library';
import { uniqueExercises } from './unique';

const ex = (key: string, name: string, extra: Partial<LibraryExercise> = {}): LibraryExercise => ({ key, name, unit: 'kg', step: 2.5, group: 'barbell', cue: '', ...extra });
const names = (list: LibraryExercise[]) => list.map(e => `${e.name.trim().toLowerCase()}|${e.unit}`);

describe('uniqueExercises', () => {
  it('lists an exercise that is in the library under two keys once', () => {
    const list = [ex('db_front_squat', 'Dumbbell front squat'), ex('db_squat', 'Dumbbell front squat'), ex('bb_bench', 'Bench press')];
    expect(uniqueExercises(list).map(e => e.key)).toEqual(['db_front_squat', 'bb_bench']);
  });
  it('keeps the one used in more workouts, then the one with a picture', () => {
    const list = [ex('a', 'Front squat'), ex('b', 'Front squat', { poster: 'p.jpg' }), ex('c', 'front squat ')];
    expect(uniqueExercises(list).map(e => e.key)).toEqual(['b']);
    expect(uniqueExercises(list, { c: 3 }).map(e => e.key)).toEqual(['c']);
  });
  it('keeps two exercises that share a name and are counted differently', () => {
    expect(uniqueExercises([ex('bw_calf_raise', 'Calf raise', { unit: '' }), ex('machine_calf_raise', 'Calf raise')])).toHaveLength(2);
  });
  it('leaves the whole library with no name twice', () => {
    const all = names(uniqueExercises(Object.values(FULL_LIBRARY)));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('Swap', () => {
  it('offers no exercise twice, and never the exercise itself under its other key', () => {
    for (const key of ['db_front_squat', 'bb_overhead_lunge', 'bb_back_squat', 'db_lunge']) {
      const from = FULL_LIBRARY[key];
      const opts = alternatives(key, 20, FULL_LIBRARY, 50).map(a => a.exercise);
      expect(new Set(names(opts)).size).toBe(opts.length);
      expect(names(opts)).not.toContain(names([from])[0]);
    }
  });
});
