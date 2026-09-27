import { describe, expect, it } from 'vitest';
import type { Block, ExerciseStep, Runsheet } from './model';
import type { SessionResult, SetResult } from './progression';
import { bankTop, nextTime, scoreTarget, setTarget, timerTarget, today } from './targets';

const kb = { key: 'kb_swing', name: 'Kettlebell swings', unit: 'kg', step: 4 };
const bench = { key: 'bb_bench', name: 'Bench press', unit: 'kg', step: 2.5 };
const pushup = { key: 'bw_pushup', name: 'Push-ups', unit: '', step: 1 };
const step = (exercise: ExerciseStep['exercise'], init: Partial<ExerciseStep> = {}): ExerciseStep => ({ kind: 'exercise', id: `s-${exercise.key}`, exercise, forMode: 'reps', forValue: 8, target: 24, ...init });
const block = (init: Partial<Block>): Block => ({ kind: 'block', id: 'b1', name: 'Main', repeat: 3, steps: [step(kb)], ...init });
const sheet = (items: Runsheet['items'], id = 'w'): Runsheet => ({ id, title: 'Work', items });
const scored = (day: number, score: number, completed = true, runsheetId = 'w'): SessionResult => ({ id: `r${day}`, runsheetId, startedAt: `2026-09-${String(day).padStart(2, '0')}T10:00:00Z`, score, completed, steps: [] });
const sets = (load: number | undefined, ...reps: number[]): SetResult[] => reps.map(r => ({ reps: r, ...(load !== undefined ? { load } : {}) }));

describe('density targets for timed work', () => {
  const amrap = sheet([block({ mode: 'amrap', timeCapSec: 600, repeat: 1 })]);
  const history = [scored(1, 6), scored(8, 7), scored(15, 7), scored(22, 8)];

  it('aims at the best of the last three rounds, in the workout’s own terms', () => {
    const t = scoreTarget(amrap, history)!;
    expect(t.text).toBe('Aim for 8+ rounds');
    expect(t.detail).toBe('Last 3 times: 7, 7, 8 rounds');
    expect(t.pace).toBe(75);
  });

  it('scales with intent: restore holds the middle, overreach adds a round', () => {
    expect(scoreTarget(amrap, history, 'restore')!.aim).toBe(7);
    expect(scoreTarget(amrap, history, 'overreach')!.aim).toBe(9);
  });

  it('reads a part round as reps and aims to finish the round', () => {
    const t = scoreTarget(amrap, [scored(1, 7.005)])!;
    expect(t.detail).toBe('Last time: 7+5 rounds');
    expect(t.aim).toBe(8);
  });

  it('times aim under the best finished run, and a stopped run does not count', () => {
    const fortime = sheet([block({ mode: 'fortime', repeat: 5 })]);
    const t = scoreTarget(fortime, [scored(1, 730), scored(8, 715), scored(15, 700), scored(20, 500, false)])!;
    expect(t.text).toBe('Finish in under 11:40');
    expect(t.detail).toBe('Last 3 times: 12:10, 11:55, 11:40');
    expect(t.pace).toBe(140);
    expect(scoreTarget(fortime, [scored(1, 700)], 'overreach')!.aim).toBe(680);
  });

  it('is nothing for an unscored workout or one with no scored history', () => {
    expect(scoreTarget(sheet([block({})]), history)).toBeUndefined();
    expect(scoreTarget(amrap, [scored(1, 8, true, 'other')])).toBeUndefined();
  });
});

describe('increment-aware load targets', () => {
  it('banks reps until the set at the next bell is no harder', () => {
    // 28 × 8 by Epley is 24 × 14.3: bank to 15 at 24 kg before the jump.
    expect(bankTop(24, 4, 8)).toBe(15);
    expect(bankTop(60, 2.5, 5)).toBe(7);
    expect(bankTop(4, 4, 8)).toBe(16); // never past double
  });

  it('adds a rep a set at the current load while banking', () => {
    const t = setTarget(step(kb), sets(24, 9, 9, 8))!;
    expect(t.text).toBe('24 kg × 10, 10, 9');
    expect(t.jump).toBe(false);
    expect(t.reason).toBe('bank reps: 28 kg once every set reaches 15');
  });

  it('jumps a bell once every set reached the top, back to the bottom of the range', () => {
    const t = setTarget(step(kb, { forMax: 12 }), sets(24, 12, 12, 12))!;
    expect(t).toMatchObject({ load: 28, reps: [8, 8, 8], jump: true, text: '28 kg × 8' });
  });

  it('does not bank past the top of a range', () => {
    expect(setTarget(step(kb, { forMax: 12 }), sets(24, 12, 11, 12))!.reps).toEqual([12, 12, 12]);
  });

  it('reads the working sets at the top load, not warm-ups', () => {
    expect(setTarget(step(bench, { forValue: 5 }), [...sets(40, 10), ...sets(60, 5, 5)])!.text).toBe('60 kg × 6');
  });

  it('restore repeats last time; overreach adds two', () => {
    expect(setTarget(step(kb, { forMax: 12 }), sets(24, 12, 12), 'restore')!.text).toBe('24 kg × 12');
    expect(setTarget(step(kb), sets(24, 9, 8), 'overreach')!.text).toBe('24 kg × 11, 10');
  });

  it('bodyweight gets reps', () => {
    expect(setTarget(step(pushup, { target: undefined }), sets(undefined, 12, 10))!.text).toBe('13, 11 reps');
  });

  it('leaves alone what it should not move', () => {
    expect(setTarget(step(kb), undefined)).toBeUndefined();
    expect(setTarget(step(kb, { targetPct: 70 }), sets(24, 8))).toBeUndefined();
    expect(setTarget(step(kb, { sets: [{ load: 20 }, { load: 24 }] }), sets(24, 8))).toBeUndefined();
    expect(setTarget(step(kb, { forMode: 'seconds' }), sets(24, 8))).toBeUndefined();
    expect(setTarget(step({ key: 'sprint', name: 'Sprints', unit: 'kph', step: 0.5 }), sets(14, 1))).toBeUndefined();
  });
});

describe('where the target shows', () => {
  const s = step(kb);
  const strength = sheet([block({ steps: [s] })]);
  const done: SessionResult = { id: 'r1', runsheetId: 'w', startedAt: '2026-09-20T10:00:00Z', steps: [{ stepId: s.id, exerciseKey: 'kb_swing', sets: sets(24, 9, 9, 8) }] };

  it('today names the exercise and the sets when the workout is not scored', () => {
    expect(today(strength, [done])).toMatchObject({ text: 'Kettlebell swings 24 kg × 10, 10, 9' });
  });

  it('the timer shows the set for the round it is on', () => {
    const t = today(strength, [done]);
    expect(timerTarget(t, { blockId: 'b1', stepId: s.id, round: 2 }, strength)).toBe('Target 24 × 9');
    const amrap = sheet([block({ mode: 'amrap', timeCapSec: 600, repeat: 1 })]);
    expect(timerTarget(today(amrap, [scored(1, 8)]), { blockId: 'b1', stepId: s.id, round: 0 }, amrap)).toBe('Target 8+ · 1:15 a round');
  });

  it('next time reads the session just done as the newest, and stands aside for programme rules', () => {
    const now: SessionResult = { ...done, id: 'r2', startedAt: '2026-09-27T10:00:00Z', steps: [{ stepId: s.id, exerciseKey: 'kb_swing', sets: sets(24, 10, 10, 10) }] };
    expect(nextTime(strength, now, [done]).map(l => l.text)).toEqual(['24 kg × 11']);
    expect(nextTime(strength, now, [done], 'maintain', ['kb_swing'])).toEqual([]);
  });
});
