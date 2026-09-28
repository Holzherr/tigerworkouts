import { describe, expect, it } from 'vitest';
import { makeExercise, makeRest, type Block, type ExerciseRef, type Runsheet } from './model';
import { failStreak, fmtScore, nextLoads, progressed, resolveTarget, snapLoad, workingLoad, type SessionResult } from './progression';
import { withLastUsed } from './last-used';

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

describe('progression across sessions', () => {
  const fail = (d: string, id = `s-${d}`): SessionResult => ({ id, runsheetId: 'sl-a', startedAt: d, steps: [{ stepId: 'sq', exerciseKey: 'bb_back_squat', target: 60, success: false }] });
  const squat = (r: Runsheet) => (r.items[0] as Block).steps[0] as { target?: number };

  it('deloads when the latest session is the result sheet copy of a row already in history', () => {
    // The timer logs the row at done; the result sheet then works on a copy of it.
    const logged = [fail('2026-09-06'), fail('2026-09-04'), fail('2026-09-02')];
    const sheetCopy = { ...logged[0] };
    const out = nextLoads(sl(), sheetCopy, logged);
    expect(out[0].to).toBe(55);
    expect(out[0].reason).toBe('3 failed sessions: deload 10%');
  });

  it('starts the next session on the +2.5 kg the result sheet promised', () => {
    const done: SessionResult = { id: 's1', runsheetId: 'sl-a', startedAt: '2026-09-06', steps: [{ stepId: 'sq', exerciseKey: 'bb_back_squat', target: 60, success: true }] };
    const next = progressed(withLastUsed(sl(), [done]), [done]);
    expect(squat(next).target).toBe(62.5);
  });

  it('repeats the weight after a miss and deloads after three', () => {
    expect(squat(progressed(sl(), [fail('2026-09-06')])).target).toBe(60);
    expect(squat(progressed(sl(), [fail('2026-09-06'), fail('2026-09-04'), fail('2026-09-02')])).target).toBe(55);
  });

  it('deloads once, then counts misses again from the deload', () => {
    const four = [fail('2026-09-08'), fail('2026-09-06'), fail('2026-09-04'), fail('2026-09-02')];
    expect(squat(progressed(sl(), four)).target).toBe(60);
    const out = nextLoads(sl(), four[0], four);
    expect(out[0].reason).toBe('missed reps (1/3): repeat the weight');
    const six = [fail('2026-09-12'), fail('2026-09-10'), ...four];
    expect(squat(progressed(sl(), six)).target).toBe(55);
  });

  it('carries the squat over from the other program day', () => {
    const dayB: SessionResult = { id: 'b', runsheetId: 'sl-b', startedAt: '2026-09-08', steps: [{ stepId: 'other', exerciseKey: 'bb_back_squat', target: 65, success: true }] };
    expect(squat(progressed(sl(), [fail('2026-09-06'), dayB])).target).toBe(67.5);
  });

  it('leaves workouts without rules alone', () => {
    const r = sl();
    (r.items[0] as Block).progression = undefined;
    const done: SessionResult = { id: 's1', runsheetId: 'sl-a', startedAt: '2026-09-06', steps: [{ stepId: 'sq', exerciseKey: 'bb_back_squat', target: 60, success: true }] };
    expect(progressed(r, [done])).toBe(r);
  });
});

describe('drop sets', () => {
  const dropped = { target: 60, sets: [{ load: 100, reps: 5 }, { load: 100, reps: 5 }, { load: 60, reps: 10, type: 'drop' as const }] };
  it('are not the working load', () => {
    expect(workingLoad(dropped)).toBe(100);
    expect(workingLoad({ target: 90, sets: dropped.sets })).toBe(90);
    expect(workingLoad({ target: 80 })).toBe(80);
  });
  it('do not become the next session\'s starting load', () => {
    const r: Runsheet = { id: 'w', title: 'Bench', items: [{ ...makeExercise(SQ, { forMode: 'reps', forValue: 5, target: 80 }), id: 'e' }] };
    const out = withLastUsed(r, [{ runsheetId: 'w', startedAt: '2026-09-06', steps: [{ stepId: 'e', exerciseKey: 'bb_back_squat', ...dropped }] }]);
    expect((out.items[0] as { target?: number }).target).toBe(100);
  });
});
