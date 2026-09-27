import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FULL_LIBRARY } from '@/features/workouts/imported';
import type { SessionResult } from '@/features/runsheet/progression';
import type { LibraryExercise } from '@/features/exercises/library';
import { customExercise, matcher, parseCsv, parseDate, parseDuration, parseWorkoutCsv, planImport, toCsv, type ParsedCsv } from './csv';

const fixture = (name: string) => readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8');
const parsed = (name: string) => {
  const out = parseWorkoutCsv(fixture(name));
  if ('error' in out) throw new Error(out.error);
  return out;
};
const local = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi).toISOString();

const results: SessionResult[] = [
  {
    id: 's-1',
    runsheetId: 'w',
    title: 'Push, heavy',
    startedAt: '2026-09-26T17:02:00.000Z',
    durationSec: 3780,
    notes: 'Felt "strong"\nshoulder ok',
    steps: [
      { stepId: 'a', exerciseKey: 'bb_bench', sets: [{ load: 80, reps: 5 }, { load: 82.5, reps: 4, at: 312 } as never] },
      { stepId: 'b', exerciseKey: 'bw_pullup', sets: [{ reps: 10 }] },
      { stepId: 'c', exerciseKey: 'u_pec_deck', target: 55, reps: [12] },
    ],
  },
  { id: 's-0', runsheetId: 'activity:Padel', title: 'Padel', startedAt: '2026-09-25T18:00:00.000Z', activity: { name: 'Padel', minutes: 60 }, steps: [] },
];
const lib: Record<string, LibraryExercise> = { ...FULL_LIBRARY, u_pec_deck: customExercise('Pec deck', { loaded: true }) };
const name = (k: string) => lib[k] ?? { name: k, unit: '' };

describe('CSV export', () => {
  const csv = toCsv(results, name);
  const rows = parseCsv(csv);

  it('writes one row per set, oldest session first', () => {
    expect(rows[0]).toEqual(['date', 'workout', 'exercise', 'exercise_key', 'set', 'load', 'unit', 'reps', 'duration_seconds', 'set_time_seconds', 'notes']);
    expect(rows).toHaveLength(1 + 1 + 4);
    expect(rows[1]).toEqual(['2026-09-25T18:00:00.000Z', 'Padel', '', '', '', '', '', '', '3600', '', '']);
    expect(rows[2]).toEqual(['2026-09-26T17:02:00.000Z', 'Push, heavy', 'Barbell bench press', 'bb_bench', '1', '80', 'kg', '5', '3780', '', 'Felt "strong"\nshoulder ok']);
    expect(rows[3].slice(4, 10)).toEqual(['2', '82.5', 'kg', '4', '3780', '312']);
    expect(rows[4].slice(2, 8)).toEqual(['Pull-up', 'bw_pullup', '1', '', '', '10']);
    // an older result with no per-set rows still exports its load and reps
    expect(rows[5].slice(2, 8)).toEqual(['Pec deck', 'u_pec_deck', '1', '55', 'kg', '12']);
  });

  it('quotes commas, quotes and line breaks', () => {
    expect(csv).toContain('"Push, heavy"');
    expect(csv).toContain('"Felt ""strong""\nshoulder ok"');
  });

  it('reads back into the same sessions without doubling up', () => {
    const back = parseWorkoutCsv(csv) as ParsedCsv;
    expect(back.format).toBe('tiger');
    expect(back.sessions).toHaveLength(2);
    expect(planImport(back, results, lib).sessions).toHaveLength(0);
    const fresh = planImport(back, [], lib);
    expect(fresh.newExercises).toEqual([]);
    const push = fresh.sessions.find(s => s.title === 'Push, heavy')!;
    expect(push.steps.map(s => s.exerciseKey)).toEqual(['bb_bench', 'bw_pullup', 'u_pec_deck']);
    expect(push.steps[0].sets).toEqual([{ load: 80, reps: 5 }, { load: 82.5, reps: 4 }]);
    expect(push.notes).toBe('Felt "strong"\nshoulder ok');
  });
});

describe('reading dates and durations', () => {
  it('reads Hevy, Strong and ISO dates', () => {
    expect(parseDate('26 Sep 2026, 18:02')?.toISOString()).toBe(local(2026, 9, 26, 18, 2));
    expect(parseDate('2026-09-20 09:15:00')?.toISOString()).toBe(local(2026, 9, 20, 9, 15));
    expect(parseDate('2026-09-20T09:15:00.000Z')?.toISOString()).toBe('2026-09-20T09:15:00.000Z');
    expect(parseDate('yesterday')).toBeUndefined();
  });
  it("reads Strong's durations", () => {
    expect(parseDuration('1h 5m')).toBe(3900);
    expect(parseDuration('45m')).toBe(2700);
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('')).toBeUndefined();
  });
});

describe('Hevy import', () => {
  const hevy = parsed('hevy.csv');

  it('groups rows into sessions and exercises', () => {
    expect(hevy.format).toBe('hevy');
    expect(hevy.sessions.map(s => s.title)).toEqual(['Push Day', 'Legs']);
    const push = hevy.sessions[0];
    expect(push.startedAt).toBe(local(2026, 9, 26, 18, 2));
    expect(push.durationSec).toBe(63 * 60);
    expect(push.notes).toBe('Felt strong, shoulder ok');
    expect(push.exercises.map(e => e.name)).toEqual(['Bench Press (Barbell)', 'Pec Deck (Machine)', 'Plank']);
    expect(push.exercises[0].sets).toEqual([{ load: 40, reps: 10 }, { load: 80, reps: 5 }, { load: 82.5, reps: 4 }]);
    expect(push.exercises[2].sets).toEqual([{ seconds: 60 }]);
  });

  it('maps names onto the catalogue and makes the rest your own', () => {
    const plan = planImport(hevy, [], FULL_LIBRARY);
    const [push, legs] = [plan.sessions.find(s => s.title === 'Push Day')!, plan.sessions.find(s => s.title === 'Legs')!];
    expect(push.steps.map(s => s.exerciseKey)).toEqual(['bb_bench', 'u_pec_deck_machine', 'bw_plank']);
    expect(legs.steps[0].exerciseKey).toBe('bb_back_squat');
    // a plank's time is its load, since the plank counts seconds
    expect(push.steps[2].sets).toEqual([{ load: 60 }]);
    expect(plan.newExercises).toEqual([{ key: 'u_pec_deck_machine', name: 'Pec Deck (Machine)', unit: 'kg', step: 2.5, group: 'barbell', cue: '' }]);
    expect(plan.matched).toContainEqual({ name: 'Bench Press (Barbell)', key: 'bb_bench' });
    expect(push.runsheetId).toBe('import:hevy');
    expect(push.id).toMatch(/^s-imp-/);
  });

  it('skips a session already in History on the same day under the same name', () => {
    const existing: SessionResult[] = [{ id: 'x', runsheetId: 'w', title: 'push day', startedAt: local(2026, 9, 26, 9, 0), steps: [] }];
    const plan = planImport(hevy, existing, FULL_LIBRARY);
    expect(plan.sessions.map(s => s.title)).toEqual(['Legs']);
    expect(plan.duplicates.map(d => d.title)).toEqual(['Push Day']);
  });

  it('gives the same session the same id on every import', () => {
    expect(planImport(hevy, [], FULL_LIBRARY).sessions.map(s => s.id)).toEqual(planImport(hevy, [], FULL_LIBRARY).sessions.map(s => s.id));
  });

  it('converts a pounds export', () => {
    const lbs = parseWorkoutCsv(fixture('hevy.csv').replace('"weight_kg"', '"weight_lbs"')) as ParsedCsv;
    expect(lbs.sessions[1].exercises[0].sets[0].load).toBeCloseTo(45.36, 2);
  });
});

describe('Strong import', () => {
  it('reads the current format and skips rest-timer rows', () => {
    const strong = parsed('strong.csv');
    expect(strong.format).toBe('strong');
    expect(strong.sessions).toHaveLength(1);
    const s = strong.sessions[0];
    expect(s.title).toBe('Morning, upper');
    expect(s.startedAt).toBe(local(2026, 9, 20, 9, 15));
    expect(s.durationSec).toBe(3900);
    expect(s.notes).toBe('Gym busy, swapped rows');
    expect(s.exercises[0].sets).toEqual([{ load: 60, reps: 8 }, { load: 62.5, reps: 6 }]);
    // weight 0 is bodyweight, not a load of nothing
    expect(s.exercises[1].sets).toEqual([{ reps: 10 }]);

    const plan = planImport(strong, [], FULL_LIBRARY);
    expect(plan.sessions[0].steps.map(x => x.exerciseKey)).toEqual(['bb_bench', 'bw_pullup', 'u_landmine_press']);
    expect(plan.newExercises[0]).toMatchObject({ key: 'u_landmine_press', unit: 'kg', group: 'body' });
  });

  it('reads the older semicolon format with a weight unit', () => {
    const old = parsed('strong-old.csv');
    expect(old.sessions[0].exercises[0].sets[0]).toEqual({ load: 102.06, reps: 5 });
    expect(old.sessions[0].durationSec).toBe(2700);
  });

  it('importing the same file twice adds nothing the second time', () => {
    const strong = parsed('strong.csv');
    const first = planImport(strong, [], FULL_LIBRARY);
    expect(planImport(strong, first.sessions, { ...FULL_LIBRARY, ...Object.fromEntries(first.newExercises.map(e => [e.key, e])) }).sessions).toEqual([]);
  });
});

describe('the name matcher', () => {
  const match = matcher(FULL_LIBRARY);
  it('matches word order, plurals and hyphens', () => {
    expect(match('Bench Press (Barbell)')).toBe('bb_bench');
    expect(match('Pull Up')).toBe('bw_pullup');
    expect(match('Push Ups')).toBe('bw_pushup');
    expect(match('Bent Over Row (Barbell)')).toBe('bb_row');
    expect(match('Romanian Deadlift (Barbell)')).toBe('bb_rdl');
    expect(match('Zercher carry on one leg')).toBeUndefined();
  });
  it('rejects a file that is neither app', () => {
    expect(parseWorkoutCsv('a,b\n1,2\n')).toHaveProperty('error');
  });
});
