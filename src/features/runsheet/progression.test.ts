import { describe, expect, it } from 'vitest';
import { makeExercise, makeRest, type Block, type ExerciseRef, type Runsheet } from './model';
import { failStreak, fmtScore, nextLoads, resolveTarget, snapLoad } from './progression';

const SQ: ExerciseRef = { key: 'bb_back_squat', name: 'Barbell back squat', unit: 'kg', step: 2.5 };
const OHP: ExerciseRef = { key: 'bb_ohp', name: 'Barbell overhead press', unit: 'kg', step: 2.5 };

const sl = (): Runsheet => {
  const sq = { ...makeExercise(SQ, { forMode: 'reps', forValue: 5, target: 60 }), id: 'sq' };
  const b: Block = { kind: 'block', id: 'b', name: 'Squat 5×5', repeat: 5, steps: [sq, makeRest(180)], progression: { onSuccessKg: 2.5, deloadPct: 10, failAfter: 3 } };
  return { id: 'sl-a', title: 'StrongLifts A', items: [b] };
};

describe('resolveTarget', () => {
  it('uses percent of training max, snapped to plates', () => {
    const s = makeExercise(OHP, { forMode: 'reps', forValue: 5, target: undefined });
    expect(resolveTarget({ ...s, targetPct: 65 }, { bb_ohp: 61 })).toBe(40);
    expect(resolveTarget({ ...s, targetPct: 65 }, {})).toBeUndefined();
  });
  it('uses bodyweight factor', () => {
    const s = makeExercise(SQ, { forMode: 'reps', forValue: 5 });
    expect(resolveTarget({ ...s, loadFactor: 1.5 }, {}, 80)).toBe(120);
  });
  it('snaps', () => expect(snapLoad(61.3)).toBe(62.5));
});

describe('nextLoads', () => {
  it('adds on success', () => {
    const r = sl();
    const out = nextLoads(r, { runsheetId: 'sl-a', startedAt: '2026-09-06', steps: [{ stepId: 'sq', exerciseKey: 'bb_back_squat', target: 60, success: true }] });
    expect(out).toEqual([{ exerciseKey: 'bb_back_squat', name: 'Barbell back squat', from: 60, to: 62.5, reason: 'all sets done: +2.5 kg' }]);
  });
  it('repeats then deloads after three failures', () => {
    const r = sl();
    const fail = (d: string) => ({ runsheetId: 'sl-a', startedAt: d, steps: [{ stepId: 'sq', exerciseKey: 'bb_back_squat', target: 60, success: false }] });
    expect(nextLoads(r, fail('2026-09-06'))[0].to).toBe(60);
    const out = nextLoads(r, fail('2026-09-06'), [fail('2026-09-04'), fail('2026-09-02')]);
    expect(out[0].to).toBe(55);
    expect(out[0].reason).toMatch(/deload/);
  });
  it('bumps the training max from an amrap set', () => {
    const s = { ...makeExercise(OHP, { forMode: 'amrap', forValue: 5 }), id: 'p', targetPct: 85 };
    const r: Runsheet = { id: 'w', title: '5/3/1', progression: { amrapBumpAt: 5, tmBumpKg: 2.5 }, items: [s] };
    const out = nextLoads(r, { runsheetId: 'w', startedAt: '2026-09-06', steps: [{ stepId: 'p', exerciseKey: 'bb_ohp', reps: [8] }] }, [], { bb_ohp: 60 });
    expect(out[0]).toMatchObject({ from: 60, to: 62.5 });
  });
});

describe('streak and score', () => {
  it('counts consecutive failures from the latest session', () => {
    const h = (d: string, ok: boolean) => ({ runsheetId: 'x', startedAt: d, steps: [{ stepId: 's', exerciseKey: 'k', success: ok }] });
    expect(failStreak([h('2026-09-01', true), h('2026-09-03', false), h('2026-09-05', false)], 'k')).toBe(2);
  });
  it('formats scores', () => {
    expect(fmtScore('time', 245)).toBe('4:05');
    expect(fmtScore('rounds', 12.007)).toBe('12 rounds + 7 reps');
  });
});
