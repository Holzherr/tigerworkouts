import { describe, expect, it } from 'vitest';
import { makeExercise, type Runsheet } from '@/features/runsheet/model';
import { EX } from '@/features/runsheet/fixtures';
import type { SessionResult } from '@/features/runsheet/progression';
import { nextTime, setTargets, today } from '@/features/runsheet/targets';
import { answered, modeFor, readSuggest, shouldAsk, storedSuggest, suggestEnabled, suggestOn, withExercise, withWorkout } from './suggestions';
import { effortLifts, liftRpe, ratedRows } from './components/lift-effort';

const press = { ...makeExercise(EX.db_shoulder_press, { target: 25, forMode: 'reps', forValue: 8 }), id: 's1' };
const pushup = { ...makeExercise(EX.pushup, { forMode: 'reps', forValue: 12 }), id: 's2' };
const w: Runsheet = { id: 'u-w', title: 'Push', items: [{ kind: 'block', id: 'b1', name: 'Press', repeat: 3, mode: 'rounds', steps: [press] }] };
const done = (at: string, sets: [number, number, number?][]): SessionResult => ({ id: at, runsheetId: 'u-w', startedAt: at, steps: [{ stepId: 's1', exerciseKey: press.exercise.key, target: sets[0][0], reps: sets.map(x => x[1]), sets: sets.map(([load, reps, rpe]) => ({ load, reps, ...(rpe ? { rpe } : {}) })) }] });
const made = [done('2026-11-08T10:00:00Z', [[25, 8], [25, 8], [25, 8]])];

describe('suggestions pref', () => {
  it('is on, by reps, until set', () => {
    expect(suggestEnabled(undefined)).toBe(true);
    expect(modeFor(undefined, 'x')).toBe('reps');
    expect(suggestOn({}, w)).toBe(true);
    expect(storedSuggest({})).toBeUndefined();
    expect(storedSuggest({ off: undefined, mode: 'weight' })).toEqual({ mode: 'weight' });
  });
  it('reads what the phone wrote, an unknown mode as unset', () => {
    expect(readSuggest({ off: true, mode: 'tempo', exercises: { a: 'effort', b: 'nope' }, offWorkouts: ['u-1', 3] })).toEqual({ off: true, mode: undefined, asked: undefined, exercises: { a: 'effort' }, offWorkouts: ['u-1'] });
    expect(readSuggest(null)).toEqual({});
    expect(readSuggest('x')).toEqual({});
  });
  it('an exercise can go its own way; clearing it follows the account again', () => {
    const p = withExercise({ mode: 'weight' }, 'squat', 'effort');
    expect(modeFor(p, 'squat')).toBe('effort');
    expect(modeFor(p, 'bench')).toBe('weight');
    expect(withExercise(p, 'squat', undefined).exercises).toBeUndefined();
  });
  it('off for one workout covers the workout it was copied from, and comes back on', () => {
    const copy = { id: 'u-copy', title: 'Push (mine)', copyOf: 'u-w' };
    const off = withWorkout({}, w, false);
    expect(off.offWorkouts).toEqual(['u-w']);
    expect(suggestOn(off, w)).toBe(false);
    expect(suggestOn(off, copy)).toBe(false);
    expect(suggestOn(off, { id: 'u-other', title: 'Other' })).toBe(true);
    expect(withWorkout(off, copy, true).offWorkouts).toBeUndefined();
    expect(suggestOn({ off: true }, w)).toBe(false);
  });
  it('asks once, only on a workout with a loaded lift', () => {
    expect(shouldAsk(undefined, w)).toBe(true);
    expect(shouldAsk(undefined, { title: 'Bodyweight', items: [pushup] })).toBe(false);
    expect(shouldAsk(undefined, { title: 'Run', items: [{ ...makeExercise(EX.sprint, { target: 14 }), id: 'r' }] })).toBe(false);
    expect(shouldAsk(answered(undefined, true, 'weight'), w)).toBe(false);
    expect(shouldAsk({ off: true }, w)).toBe(false);
    expect(answered({}, false)).toEqual({ asked: true, off: true });
    expect(answered({ off: true }, true, 'effort')).toEqual({ asked: true, off: undefined, mode: 'effort' });
  });
});

describe('targets follow the setting', () => {
  it('by reps banks a rep, by weight adds a step once every set made the reps', () => {
    expect(today(w, made, 'maintain')?.text).toBe('Shoulder press 25 kg × 9');
    expect(today(w, made, 'maintain', undefined, { mode: 'weight' })?.text).toBe('Shoulder press 27.5 kg × 8');
    expect(today(w, made, 'maintain', undefined, { mode: 'reps', exercises: { [press.exercise.key]: 'weight' } })?.text).toBe('Shoulder press 27.5 kg × 8');
  });
  it('by effort holds until the hardest set was 7 or less', () => {
    const p = { mode: 'effort' as const };
    expect(today(w, made, 'maintain', undefined, p)?.text).toBe('Shoulder press 25 kg × 8');
    expect(today(w, [done('2026-11-08T10:00:00Z', [[25, 8, 7], [25, 8, 7], [25, 8, 6]])], 'maintain', undefined, p)?.text).toBe('Shoulder press 27.5 kg × 8');
    expect(today(w, [done('2026-11-08T10:00:00Z', [[25, 8, 9], [25, 8, 7], [25, 8, 6]])], 'maintain', undefined, p)?.text).toBe('Shoulder press 25 kg × 8');
  });
  it('off means no Today, no targets and no Next time, for the account or the one workout', () => {
    for (const p of [{ off: true }, { offWorkouts: ['u-w'] }]) {
      expect(today(w, made, 'maintain', undefined, p)).toBeUndefined();
      expect(setTargets(w, made, 'maintain', undefined, p)).toEqual([]);
      expect(nextTime(w, made[0], made, 'maintain', [], undefined, p)).toEqual([]);
    }
  });
});

describe('how hard was each lift', () => {
  const rows = made[0].steps;
  it('asks only for lifts progressed by effort, with suggestions on', () => {
    expect(effortLifts(w, rows, { mode: 'effort' })).toEqual([{ key: press.exercise.key, name: 'Shoulder press' }]);
    expect(effortLifts(w, rows, { mode: 'reps' })).toEqual([]);
    expect(effortLifts(w, rows, { mode: 'effort', off: true })).toEqual([]);
    expect(effortLifts(w, [], { mode: 'effort' })).toEqual([]);
  });
  it('writes the RPE on every working set and takes it off again', () => {
    const withWarmup = [{ ...rows[0], sets: [{ load: 10, reps: 10, type: 'warmup' as const }, ...rows[0].sets!] }];
    const rated = ratedRows(withWarmup, press.exercise.key, 7);
    expect(rated[0].sets!.map(x => x.rpe)).toEqual([undefined, 7, 7, 7]);
    expect(liftRpe(rated, press.exercise.key)).toBe(7);
    expect(liftRpe(ratedRows(rated, press.exercise.key, undefined), press.exercise.key)).toBeUndefined();
  });
});
