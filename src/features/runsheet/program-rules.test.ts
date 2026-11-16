import { describe, expect, it } from 'vitest';
import { IMPORTED } from '@/features/workouts/imported';
import type { Block, ExerciseStep, Runsheet } from './model';
import { madeIt, progressed, type SessionResult, type StepResult } from './progression';
import { withLastUsed } from './last-used';
import { ruleTargets, ruleText, setTargets, today } from './targets';

const program = (id: string): Runsheet => IMPORTED.find(w => w.runsheet.id === id)!.runsheet;
const A = program('prog-stronglifts-5x5-a');
const B = program('prog-stronglifts-5x5-b');
const fives = (load: number, reps = [5, 5, 5, 5, 5]) => reps.map(n => ({ load, reps: n }));
const row = (stepId: string, exerciseKey: string, load: number, reps?: number[], success?: boolean): StepResult => ({ stepId, exerciseKey, target: load, reps: reps ?? [5, 5, 5, 5, 5], sets: fives(load, reps), ...(success === undefined ? {} : { success }) });
const session = (id: string, runsheetId: string, day: number, steps: StepResult[]): SessionResult => ({ id, runsheetId, startedAt: `2026-11-${String(day).padStart(2, '0')}T10:00:00Z`, steps });
const dayA = (id: string, day: number, squat: number, bench: number, rowKg: number, success?: boolean) => session(id, A.id!, day, [row('s1', 'bb_back_squat', squat, undefined, success), row('s2', 'bb_bench', bench, undefined, success), row('s3', 'bb_row', rowKg, undefined, success)]);
const dayB = (id: string, day: number, squat: number, press: number, dead: number) => session(id, B.id!, day, [row('s1', 'bb_back_squat', squat), row('s2', 'bb_ohp', press), row('s3', 'bb_deadlift', dead, [5])]);

describe('program days that state a rule carry it as data (review D16)', () => {
  it('covers the linear-progression lifting programs in the catalogue', () => {
    const ruledOf = (prefix: string) => IMPORTED.filter(w => w.runsheet.id?.startsWith(prefix)).map(w => w.runsheet.items.filter((i): i is Block => i.kind === 'block' && !!i.progression).length);
    for (const p of ['prog-stronglifts', 'prog-starting-strength', 'prog-greyskull', 'prog-gzclp', 'prog-reddit-ppl']) {
      const n = ruledOf(p);
      expect(n.length, p).toBeGreaterThan(0);
      expect(n.every(x => x > 0), p).toBe(true);
    }
    expect((B.items[2] as Block).progression).toEqual({ onSuccessKg: 5, deloadPct: 10, failAfter: 3 });
    expect(ruleText(A)).toBe('every set made, add 2.5 kg');
    expect(ruleText(B)).toBe('every set made, add 2.5 kg (barbell deadlift 5 kg)');
  });

  it('Today follows the rule: a line per lift with the change, across day A and day B', () => {
    // Sessions logged before the rule was data carry no made-it flag: read from their sets.
    const history = [dayA('a1', 1, 35, 27.5, 30), dayB('b1', 3, 37.5, 20, 40), dayA('a2', 5, 40, 30, 32.5)];
    const t = today(A, history)!;
    expect(t.sets.map(x => `${x.exerciseKey} ${x.text} (${x.delta})`)).toEqual(['bb_back_squat 42.5 kg × 5 (+2.5 kg)', 'bb_bench 32.5 kg × 5 (+2.5 kg)', 'bb_row 35 kg × 5 (+2.5 kg)']);
    expect(t.rule).toBe('every set made, add 2.5 kg');
    expect(t.text).toBe('Barbell back squat 42.5 kg × 5');
    // Day B reads the squat from day A, the newest session that did it.
    const b = today(B, history)!;
    expect(b.sets.map(x => `${x.exerciseKey} ${x.text} (${x.delta})`)).toEqual(['bb_back_squat 42.5 kg × 5 (+2.5 kg)', 'bb_ohp 22.5 kg × 5 (+2.5 kg)', 'bb_deadlift 45 kg × 5 (+5 kg)']);
    // The reps / weight / effort setting has nothing to say about a ruled lift.
    expect(setTargets(A, history)).toEqual([]);
  });

  it('the timer starts on the same loads Today says', () => {
    const history = [dayA('a1', 1, 35, 27.5, 30), dayA('a2', 5, 40, 30, 32.5)];
    const run = progressed(withLastUsed(A, history), history);
    const loads = run.items.flatMap(i => (i.kind === 'block' ? i.steps : [])).filter((s): s is ExerciseStep => s.kind === 'exercise').map(s => s.target);
    expect(loads).toEqual(ruleTargets(A, history).map(x => x.load));
    expect(loads).toEqual([42.5, 32.5, 35]);
  });

  it('a missed set repeats the weight; three misses running take 10% off', () => {
    const missed = (id: string, day: number) => session(id, A.id!, day, [row('s1', 'bb_back_squat', 60, [5, 5, 5, 4, 3], false)]);
    const once = ruleTargets(A, [missed('m1', 1)])[0];
    expect(once).toMatchObject({ load: 60, text: '60 kg × 5', reason: 'missed reps (1/3): repeat the weight' });
    expect(once.delta).toBeUndefined();
    const thrice = ruleTargets(A, [missed('m1', 1), missed('m2', 3), missed('m3', 5)])[0];
    // 54 kg, as the bar can be loaded: 55.
    expect(thrice).toMatchObject({ load: 55, delta: '−5 kg', reason: '3 failed sessions: deload 10%' });
  });

  it('reads made it from the sets only when the row was done to the same prescription', () => {
    const squat = (A.items[0] as Block).steps[0] as ExerciseStep;
    expect(madeIt(row('s1', 'bb_back_squat', 40), squat, 5)).toBe(true);
    expect(madeIt(row('s1', 'bb_back_squat', 40, [5, 5, 5, 5, 4]), squat, 5)).toBe(false);
    // Three sets of ten is the same lift done another way: it says nothing about 5×5.
    expect(madeIt(row('x', 'bb_back_squat', 30, [10, 10, 10]), squat, 5)).toBeUndefined();
    // What the timer recorded wins.
    expect(madeIt(row('s1', 'bb_back_squat', 40, [5, 5, 5, 5, 5], false), squat, 5)).toBe(false);
  });

  it('a program without a stated rule follows the setting', () => {
    const phul = program('prog-phul-upper-power');
    expect(ruleText(phul)).toBeUndefined();
    expect(phul.items.some(i => i.kind === 'block' && i.progression)).toBe(false);
  });
});
