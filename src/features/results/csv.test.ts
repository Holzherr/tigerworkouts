import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FULL_LIBRARY } from '@/features/workouts/imported';
import type { SessionResult } from '@/features/runsheet/progression';
import type { LibraryExercise } from '@/features/exercises/library';
import { customExercise, customKey, matcher, parseCsv, parseDate, parseDuration, parseWorkoutCsv, planImport, toCsv, type ParsedCsv } from './csv';

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
      { stepId: 'a', exerciseKey: 'bb_bench', sets: [{ load: 80, reps: 5, type: 'warmup' }, { load: 82.5, reps: 4, at: 312 }] },
      { stepId: 'b', exerciseKey: 'bw_pullup', sets: [{ reps: 10 }] },
      { stepId: 'c', exerciseKey: 'u_pec_deck', target: 55, reps: [12] },
      { stepId: 'd', exerciseKey: 'cardio_rower', sets: [{ meters: 500, seconds: 101, at: 900 }] },
      { stepId: 'e', exerciseKey: 'cardio_assault_bike', sets: [{ calories: 20, seconds: 44 }] },
    ],
  },
  { id: 's-0', runsheetId: 'activity:Padel', title: 'Padel', startedAt: '2026-09-25T18:00:00.000Z', activity: { name: 'Padel', minutes: 60 }, steps: [] },
];
const OWNER = '1a2b3c4d-5e6f-7a8b-9c0d-112233445566';
const lib: Record<string, LibraryExercise> = { ...FULL_LIBRARY, u_pec_deck: customExercise('Pec deck', { loaded: true }) };
const name = (k: string) => lib[k] ?? { name: k, unit: '' };

describe('CSV export', () => {
  const csv = toCsv(results, name);
  const rows = parseCsv(csv);

  it('writes one row per set, oldest session first', () => {
    expect(rows[0]).toEqual(['date', 'workout', 'exercise', 'exercise_key', 'set', 'set_type', 'load', 'unit', 'reps', 'seconds', 'meters', 'calories', 'duration_seconds', 'set_time_seconds', 'notes']);
    expect(rows).toHaveLength(1 + 1 + 6);
    expect(rows[1]).toEqual(['2026-09-25T18:00:00.000Z', 'Padel', '', '', '', '', '', '', '', '', '', '', '3600', '', '']);
    expect(rows[2]).toEqual(['2026-09-26T17:02:00.000Z', 'Push, heavy', 'Barbell bench press', 'bb_bench', '1', 'warmup', '80', 'kg', '5', '', '', '', '3780', '', 'Felt "strong"\nshoulder ok']);
    expect(rows[3].slice(4, 14)).toEqual(['2', 'normal', '82.5', 'kg', '4', '', '', '', '3780', '312']);
    // time worked, distance and calories each have a column
    expect(rows[6].slice(3, 14)).toEqual(['cardio_rower', '1', 'normal', '', 'm', '', '101', '500', '', '3780', '900']);
    expect(rows[7].slice(9, 12)).toEqual(['44', '', '20']);
    expect(rows[4].slice(2, 9)).toEqual(['Pull-up', 'bw_pullup', '1', 'normal', '', '', '10']);
    // an older result with no per-set rows still exports its load and reps
    expect(rows[5].slice(2, 9)).toEqual(['Pec deck', 'u_pec_deck', '1', 'normal', '55', 'kg', '12']);
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
    expect(push.steps.map(s => s.exerciseKey)).toEqual(['bb_bench', 'bw_pullup', 'u_pec_deck', 'cardio_rower', 'cardio_assault_bike']);
    expect(push.steps[0].sets).toEqual([{ load: 80, reps: 5, type: 'warmup' }, { load: 82.5, reps: 4 }]);
    expect(push.steps[3].sets).toEqual([{ meters: 500, seconds: 101 }]);
    expect(push.steps[4].sets).toEqual([{ calories: 20, seconds: 44 }]);
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
    // Hevy's set_type carries: the 40 kg set is a warm-up.
    expect(push.exercises[0].sets).toEqual([{ load: 40, reps: 10, type: 'warmup' }, { load: 80, reps: 5 }, { load: 82.5, reps: 4 }]);
    expect(push.exercises[2].sets).toEqual([{ seconds: 60 }]);
  });

  it('maps names onto the catalogue and makes the rest your own', () => {
    const plan = planImport(hevy, [], FULL_LIBRARY, OWNER);
    const [push, legs] = [plan.sessions.find(s => s.title === 'Push Day')!, plan.sessions.find(s => s.title === 'Legs')!];
    expect(push.steps.map(s => s.exerciseKey)).toEqual(['bb_bench', 'u_pec_deck_machine_1a2b3c4d', 'bw_plank']);
    expect(legs.steps[0].exerciseKey).toBe('bb_back_squat');
    // a plank's time is its time worked
    expect(push.steps[2].sets).toEqual([{ seconds: 60 }]);
    expect(plan.newExercises).toEqual([{ key: 'u_pec_deck_machine_1a2b3c4d', name: 'Pec Deck (Machine)', unit: 'kg', step: 2.5, group: 'barbell', cue: '' }]);
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

  it('reads distance in km or miles into metres, with the time', () => {
    const head = '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"';
    const row = '"Row","26 Sep 2026, 18:02","26 Sep 2026, 18:30","","Rowing (Machine)",,"",0,"normal",,,0.5,101,';
    const km = parseWorkoutCsv(`${head}\n${row}\n`) as ParsedCsv;
    expect(km.sessions[0].exercises[0].sets).toEqual([{ meters: 500, seconds: 101 }]);
    const mi = parseWorkoutCsv(`${head.replace('distance_km', 'distance_miles')}\n${row.replace('0.5', '1')}\n`) as ParsedCsv;
    expect(mi.sessions[0].exercises[0].sets[0].meters).toBeCloseTo(1609.3, 1);
    // an unmatched distance exercise counts in metres
    expect(planImport(km, [], {}).newExercises[0]).toMatchObject({ unit: 'm' });
  });

  it('converts a pounds export', () => {
    const lbs = parseWorkoutCsv(fixture('hevy.csv').replace('"weight_kg"', '"weight_lbs"')) as ParsedCsv;
    expect(lbs.sessions[1].exercises[0].sets[0].load).toBeCloseTo(45.36, 2);
  });
});

describe('your own exercise keys', () => {
  it('carry your account, so two people adding the same name never share a row', () => {
    expect(customKey('Sled push', OWNER)).toBe('u_sled_push_1a2b3c4d');
    expect(customKey('Sled push', '9f8e7d6c-0000-0000-0000-000000000000')).toBe('u_sled_push_9f8e7d6c');
    expect(customExercise('Sled push', { owner: OWNER }).key).toBe('u_sled_push_1a2b3c4d');
  });
  it('before sign-in, a random tag stands in', () => {
    const a = customKey('Sled push');
    expect(a).toMatch(/^u_sled_push_[0-9a-z]{8}$/);
    expect(customKey('Sled push')).not.toBe(a);
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

    const plan = planImport(strong, [], FULL_LIBRARY, OWNER);
    // Landmine press is a catalogue staple, so it matches rather than becoming a new exercise.
    expect(plan.sessions[0].steps.map(x => x.exerciseKey)).toEqual(['bb_bench', 'bw_pullup', 'bb_landmine_press']);
    expect(plan.newExercises).toEqual([]);
  });

  it('reads a distance in the unit the file gives, km when it gives none', () => {
    const head = 'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE';
    const s = parseWorkoutCsv(`${head}\n2026-09-20 09:15:00,Run,30m,Running,1,0,0,5.0,1500,,,\n`) as ParsedCsv;
    expect(s.sessions[0].exercises[0].sets).toEqual([{ meters: 5000, seconds: 1500 }]);
    const old = parseWorkoutCsv('Date;Workout Name;Duration;Exercise Name;Set Order;Weight;Weight Unit;Reps;Distance;Distance Unit;Seconds;Notes;Workout Notes;RPE\n2026-09-18 18:00:00;Run;45m;Running;1;;;;2;mi;900;;;\n') as ParsedCsv;
    expect(old.sessions[0].exercises[0].sets[0].meters).toBeCloseTo(3218.7, 1);
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
