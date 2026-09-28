import { describe, expect, it } from 'vitest';
import { EX } from '@/features/runsheet/fixtures';
import { makeExercise, makeRest, type Block, type Runsheet } from '@/features/runsheet/model';
import { adjust, advance, drop, elapsed, expand, pause, replan, resume, start, swap, tick, toResult } from './runner';
import * as R from './runner';

const swings = () => ({ ...makeExercise(EX.kb_swing, { target: 28 }), id: 'sw' });
const press = () => ({ ...makeExercise(EX.db_incline_press, { target: 20 }), id: 'pr' });
const interval = (): Runsheet => ({ id: 'i', title: 'Interval', items: [{ kind: 'block', id: 'b', name: 'B', repeat: 2, steps: [swings(), { ...makeRest(10), id: 'r1' }, press(), { ...makeRest(10), id: 'r2' }] }] });
const cindy = (): Runsheet => ({ id: 'c', title: 'Cindy', items: [{ kind: 'block', id: 'b', name: 'Cindy', mode: 'amrap', timeCapSec: 60, repeat: 1, steps: [{ ...makeExercise(EX.bw_pullup, { forMode: 'reps', forValue: 5 }), id: 'a' }, { ...makeExercise(EX.bw_pushup, { forMode: 'reps', forValue: 10 }), id: 'b2' }] }] });

describe('expand', () => {
  it('unrolls rounds and adds rest between them', () => {
    const b: Block = { kind: 'block', id: 'b', name: 'B', repeat: 3, restBetweenSec: 60, steps: [swings()] };
    const slots = expand({ title: 't', items: [b] });
    expect(slots.map(s => s.kind)).toEqual(['work', 'rest', 'work', 'rest', 'work']);
  });
  it('ladders scale reps per rung', () => {
    const b: Block = { kind: 'block', id: 'b', name: 'B', repeat: 1, mode: 'ladder', ladder: [21, 15, 9], steps: [{ ...makeExercise(EX.bw_pullup, { forMode: 'reps', forValue: 21 }), id: 'p' }] };
    const slots = expand({ title: 't', items: [b] });
    expect(slots.map(s => (s.step.kind === 'exercise' ? s.step.forValue : 0))).toEqual([21, 15, 9]);
    expect(slots[0].seconds).toBeUndefined(); // reps are user-paced
  });
  it('emom adds a wait-for-boundary rest each minute', () => {
    const b: Block = { kind: 'block', id: 'b', name: 'E', repeat: 2, mode: 'emom', everySec: 60, steps: [{ ...makeExercise(EX.bw_burpee, { forMode: 'reps', forValue: 5 }), id: 'x' }] };
    const slots = expand({ title: 't', items: [b] });
    expect(slots.map(s => s.kind)).toEqual(['work', 'rest', 'work', 'rest']);
    expect(slots[1].untilBoundary).toBe(true);
  });
});

describe('run', () => {
  it('leads in, counts down, advances, and finishes', () => {
    let s = start(interval(), 0);
    expect(s.phase).toBe('lead');
    s = tick(s, 5000);
    expect(s.phase).toBe('running');
    expect(s.i).toBe(0);
    s = tick(s, 5000 + 30000); // 30 s swings
    expect(s.i).toBe(1);
    expect(s.slots[1].kind).toBe('rest');
    for (let t = 35000; t < 200000 && s.phase !== 'done'; t += 1000) s = tick(s, t);
    expect(s.phase).toBe('done');
    expect(elapsed(s, 200000)).toBeCloseTo((s.endedAt! - 0) / 1000, 0);
  });
  it('pause freezes the countdown and resume restores it', () => {
    let s = tick(start(interval(), 0), 5000);
    s = pause(s, 15000); // 20 s left
    s = tick(s, 60000);
    expect(s.phase).toBe('paused');
    s = resume(s, 60000);
    expect(Math.round((s.endsAt! - 60000) / 1000)).toBe(20);
    expect(s.pausedMs).toBe(45000);
  });
  it('extendRest moves the end of a running rest, and only a rest', () => {
    let s = tick(start(interval(), 0), 5000);
    expect(R.extendRest(s, 6000, 15)).toBe(s); // work: untouched
    s = advance(s, 20000); // on to the 10 s rest, ends at 30 s
    s = R.extendRest(s, 21000, 15);
    expect(s.endsAt).toBe(45000);
    s = R.extendRest(s, 22000, -60); // past now: ends on the next tick
    expect(s.endsAt).toBe(22000);
    expect(tick(s, 22000).slots[tick(s, 22000).i].kind).toBe('work');
  });
  it('extendRest while paused moves what is left', () => {
    let s = advance(tick(start(interval(), 0), 5000), 20000);
    s = pause(s, 25000); // 5 s left
    s = R.extendRest(s, 26000, 15);
    s = resume(s, 30000);
    expect(s.endsAt).toBe(50000);
  });
  it('adjust logs a change with the time into the step', () => {
    let s = tick(start(interval(), 0), 5000);
    s = adjust(s, 12000, 32);
    expect(s.actuals[s.slots[0].id].changes).toEqual([{ atSec: 7, target: 32 }]);
  });
  it('drop removes every later slot of that step', () => {
    let s = tick(start(interval(), 0), 5000);
    s = drop(s, 6000, 'pr');
    expect(s.slots.some(x => x.step.id === 'pr')).toBe(false);
    expect(s.slots.length).toBe(6);
  });
  it('swap changes what is left of a step, not what is done', () => {
    let s = tick(start(interval(), 0), 5000);
    s = advance(s, 20000); // first swings done
    s = swap(s, 21000, 'sw', EX.bw_squat, undefined);
    const done = s.slots.slice(0, s.i).filter(x => x.step.id === 'sw');
    const left = s.slots.slice(s.i).filter(x => x.step.id === 'sw');
    expect(done.every(x => x.step.kind === 'exercise' && x.step.exercise.key === 'kb_swing')).toBe(true);
    expect(left.length).toBeGreaterThan(0);
    expect(left.every(x => x.step.kind === 'exercise' && x.step.exercise.key === 'bw_squat')).toBe(true);
  });
  it('amrap stops at the cap and scores rounds + reps', () => {
    let s = tick(start(cindy(), 0), 5000);
    // each Done ~10 s: 5 slots = 2 rounds + 1 step before the 60 s cap
    let t = 5000;
    for (let k = 0; k < 5; k++) {
      t += 10000;
      s = advance(s, t);
    }
    s = tick(s, 5000 + 61000);
    expect(s.phase).toBe('done');
    const res = toResult(s, cindy(), 70000);
    expect(res.score).toBeCloseTo(2.005, 3);
  });
  it('toResult carries adjusted targets', () => {
    let s = tick(start(interval(), 0), 5000);
    s = adjust(s, 6000, 32);
    s = advance(s, 35000);
    const res = toResult(s, interval(), 40000);
    expect(res.steps.find(x => x.stepId === 'sw')?.target).toBe(32);
  });
});


describe('load changes carry forward and blocks gate', () => {
  const two = (): Runsheet => ({
    id: 'two',
    title: 'Two blocks',
    items: [
      { kind: 'block', id: 'b1', name: 'Press', repeat: 2, steps: [{ kind: 'exercise', id: 'e1', exercise: { key: 'db_incline_press', name: 'Press', unit: 'kg', step: 2.5 }, target: 15, forMode: 'seconds', forValue: 30 }] },
      { kind: 'block', id: 'b2', name: 'Walk', repeat: 1, steps: [{ kind: 'exercise', id: 'e2', exercise: { key: 'incline_walk', name: 'Walk', unit: 'kph', step: 0.5 }, target: 6, incline: 6, forMode: 'seconds', forValue: 60 }] },
    ],
  });
  it('an adjustment in round 1 is the recorded load after round 2 at the plan', () => {
    let s = R.start(two(), 0);
    s = R.advance(s, 5000); // lead → slot 0
    s = R.adjust(s, 6000, 20);
    s = R.advance(s, 40000); // slot 1 (round 2, no adjustment)
    expect(R.effectiveTarget(s, 1)).toBe(20);
    s = R.advance(s, 80000); // → block 2 gate
    expect(s.phase).toBe('ready');
    s = R.startBlock(s, 90000);
    expect(s.phase).toBe('running');
    s = R.adjustIncline(s, 5);
    s = R.advance(s, 150000);
    const res = R.toResult(s, two(), 150000);
    expect(res.steps.find(x => x.stepId === 'e1')?.target).toBe(20);
    expect(res.steps.find(x => x.stepId === 'e2')?.incline).toBe(5);
  });
  it('overall progress reaches 1 when done', () => {
    let s = R.start(two(), 0);
    s = R.advance(s, 5000);
    expect(R.overall(s, 5000)).toBeGreaterThanOrEqual(0);
    s = R.finish(s, 9000);
    expect(R.overall(s, 9000)).toBe(1);
  });
});

describe('adjusting a step from the overview', () => {
  it('carries to every later round of that step', () => {
    let s = R.start(interval(), 0);
    s = R.adjustStep(s, 'sw', 32);
    const loads = s.slots.map((sl, i) => (sl.step.id === 'sw' ? R.effectiveTarget(s, i) : null)).filter(x => x !== null);
    expect(loads.length).toBeGreaterThan(1);
    expect(new Set(loads)).toEqual(new Set([32]));
  });

  it('sets the incline of a step that has not started', () => {
    let s = R.start(interval(), 0);
    s = R.adjustStepIncline(s, 'pr', 6);
    const i = s.slots.findIndex(sl => sl.step.id === 'pr');
    expect(R.effectiveIncline(s, i)).toBe(6);
  });

  it('ignores a step that is not in the session', () => {
    const s = R.start(interval(), 0);
    expect(R.adjustStep(s, 'nope', 10)).toBe(s);
  });
});

/** Ported one for one to RunnerTests.swift: same cases, same names. */
describe('replan: editing what is still to come', () => {
  // 2 rounds of swings, then 3 rounds of press, then 10 squats.
  const plan = (): Runsheet => ({
    id: 'p',
    title: 'Plan',
    items: [
      { kind: 'block', id: 'b1', name: 'Swings', repeat: 2, steps: [swings()] },
      { kind: 'block', id: 'b2', name: 'Press', repeat: 3, steps: [press()] },
      { kind: 'block', id: 'b3', name: 'Squats', repeat: 1, steps: [{ ...makeExercise(EX.bw_squat, { forMode: 'reps', forValue: 10 }), id: 'sq' }] },
    ],
  });
  const withRounds = (r: Runsheet, id: string, repeat: number): Runsheet => ({ ...r, items: r.items.map(it => (it.kind === 'block' && it.id === id ? { ...it, repeat } : it)) });

  it("changing the next block's rounds from 3 to 4 adds one round after the cursor and leaves done slots and their actuals unchanged", () => {
    let s = tick(start(plan(), 0), 5000); // swings, round 1
    s = adjust(s, 6000, 32);
    s = advance(s, 35000); // round 1 done, round 2 running
    const before = s;
    s = replan(s, withRounds(plan(), 'b2', 4), 36000);
    expect(s.i).toBe(1);
    expect(s.phase).toBe('running');
    expect(s.slots.slice(0, 2)).toEqual(before.slots.slice(0, 2));
    expect(s.actuals[before.slots[0].id]).toEqual(before.actuals[before.slots[0].id]);
    expect(s.slots.filter(sl => sl.blockId === 'b2').length).toBe(4);
    expect(s.slots.length).toBe(2 + 4 + 1);
    expect(new Set(s.slots.map(sl => sl.id)).size).toBe(s.slots.length);
  });

  it('a block moved up runs next, and a block already done never runs again', () => {
    let s = tick(start(plan(), 0), 5000);
    s = advance(s, 35000);
    s = advance(s, 65000); // parked at the press gate
    expect(s.phase).toBe('ready');
    const [b1, b2, b3] = plan().items;
    s = replan(s, { ...plan(), items: [b3, b2, b1] }, 66000);
    expect(s.phase).toBe('ready');
    expect(s.i).toBe(2);
    expect(s.slots.slice(2).map(sl => sl.blockId)).toEqual(['b3', 'b2', 'b2', 'b2']);
    expect(s.slots.map(sl => sl.part)).toEqual([0, 0, 1, 2, 2, 2]);
    expect(s.slots.every(sl => sl.parts === 3)).toBe(true);
    s = R.startBlock(s, 70000);
    expect(R.current(s)?.step.id).toBe('sq');
  });

  it('a swap and a load set ahead survive the replan', () => {
    let s = tick(start(plan(), 0), 5000);
    s = swap(s, 6000, 'sq', EX.bw_pushup, undefined);
    s = R.adjustStep(s, 'pr', 24);
    s = replan(s, withRounds(plan(), 'b2', 4), 7000);
    expect(s.slots.filter(sl => sl.step.id === 'sq').every(sl => sl.step.kind === 'exercise' && sl.step.exercise.key === 'bw_pushup')).toBe(true);
    expect(R.plannedTarget(s, 'pr')).toBe(24);
    expect(s.slots.filter(sl => sl.step.id === 'pr').length).toBe(4);
  });

  it('during the count-in the whole session is rebuilt', () => {
    let s = start(plan(), 0);
    s = replan(s, withRounds(plan(), 'b1', 3), 1000);
    expect(s.phase).toBe('lead');
    expect(s.slots.filter(sl => sl.blockId === 'b1').length).toBe(3);
  });

  it('removing everything still to come ends the session at the gate', () => {
    let s = tick(start(plan(), 0), 5000);
    s = advance(s, 35000);
    s = advance(s, 65000);
    s = replan(s, { ...plan(), items: [plan().items[0]] }, 66000);
    expect(s.phase).toBe('done');
    expect(s.slots.length).toBe(2);
  });
});

describe('session safety', () => {
  const warmThenCindy = (): Runsheet => ({ id: 'wc', title: 'Warm-up then Cindy', items: [{ ...makeExercise(EX.bw_squat, { forMode: 'seconds', forValue: 30 }), id: 'wu' }, ...cindy().items] });

  it('a pause before a capped block does not stretch its cap', () => {
    let s = tick(start(warmThenCindy(), 0), 5000); // warm-up running
    s = pause(s, 10000);
    s = resume(s, 110000); // 100 s paused in part 1
    s = tick(s, 135000); // warm-up done, parked at the Cindy gate
    expect(s.phase).toBe('ready');
    s = R.startBlock(s, 140000);
    expect(R.blockElapsed(s, 150000)).toBe(10);
    s = tick(s, 140000 + 61000);
    expect(s.phase).toBe('done');
  });

  it('a pause inside a capped block still extends that block', () => {
    let s = tick(start(cindy(), 0), 5000);
    s = pause(s, 15000);
    s = resume(s, 45000); // 30 s paused, 10 s into the block
    expect(R.blockElapsed(s, 45000)).toBe(10);
    s = tick(s, 5000 + 61000);
    expect(s.phase).toBe('running');
    s = tick(s, 5000 + 30000 + 61000);
    expect(s.phase).toBe('done');
  });

  it('an amrap runs to its cap however many rounds are done', () => {
    let s = tick(start(cindy(), 0), 5000);
    let t = 5000;
    for (let k = 0; k < 20; k++) s = advance(s, (t += 2000)); // 10 rounds in 40 s
    expect(s.phase).toBe('running');
    expect(s.blockDone.b).toBe(20);
    s = tick(s, 5000 + 61000);
    expect(s.phase).toBe('done');
    expect(toResult(s, cindy(), 70000).score).toBe(10);
  });

  it('a swap keeps the exercise and load of the rounds already done', () => {
    let s = tick(start(interval(), 0), 5000);
    s = adjust(s, 6000, 32);
    s = advance(s, 20000); // swings round 1 at 32
    s = advance(s, 21000); // rest
    s = advance(s, 22000); // press
    s = advance(s, 23000); // rest -> swings round 2
    s = swap(s, 24000, 'sw', EX.bw_squat, 10);
    for (let t = 25000; s.phase !== 'done'; t += 1000) s = advance(s, t);
    const res = toResult(s, interval(), 40000);
    const sw = res.steps.filter(x => x.stepId === 'sw');
    expect(sw.map(x => [x.exerciseKey, x.target])).toEqual([['kb_swing', 32], ['bw_squat', 10]]);
  });
});

describe('honest logging', () => {
  it('logs each set with the reps counted and the load in hand', () => {
    const sheet: Runsheet = { id: 'p', title: 'Press', items: [{ kind: 'block', id: 'b', name: 'B', repeat: 3, steps: [{ ...makeExercise(EX.db_incline_press, { target: 20, forMode: 'reps', forValue: 8 }), id: 'pr' }] }] };
    let s = tick(start(sheet, 0), 5000);
    s = R.setReps(s, 10);
    s = advance(s, 20000);
    s = adjust(s, 21000, 22.5);
    s = advance(s, 40000);
    s = R.setReps(s, 6);
    s = advance(s, 60000);
    const pr = toResult(s, sheet, 60000).steps[0];
    expect(pr.sets).toEqual([{ reps: 10, load: 20, at: 20 }, { reps: 8, load: 22.5, at: 40 }, { reps: 6, load: 22.5, at: 60 }]);
    expect(pr.reps).toEqual([10, 8, 6]);
  });
});

describe('per-set prescription', () => {
  // Bench 60 / 70 / 80 kg for 10 / 8 / 6, 60 s rest between sets.
  const pyramid = (sets?: { reps?: number; load?: number }[]): Runsheet => ({
    id: 'py',
    title: 'Pyramid',
    items: [{ kind: 'block', id: 'b', name: 'Bench', repeat: 3, steps: [{ ...makeExercise(EX.db_incline_press, { target: 50, forMode: 'reps', forValue: 10 }), id: 'pr', sets }, { ...makeRest(60), id: 'r' }] }],
  });
  const work = (s: R.RunState) => s.slots.map((sl, i) => ({ sl, i })).filter(x => x.sl.kind === 'work');
  const full = [{ reps: 10, load: 60 }, { reps: 8, load: 70 }, { reps: 6, load: 80 }];

  it('each round runs its own reps and load', () => {
    const s = start(pyramid(full), 0);
    const w = work(s);
    expect(w.map(x => (x.sl.step.kind === 'exercise' ? x.sl.step.forValue : 0))).toEqual([10, 8, 6]);
    expect(w.map(x => R.effectiveTarget(s, x.i))).toEqual([60, 70, 80]);
  });
  it('without sets, every round is the step as before', () => {
    const s = start(pyramid(), 0);
    const w = work(s);
    expect(w.map(x => (x.sl.step.kind === 'exercise' ? x.sl.step.forValue : 0))).toEqual([10, 10, 10]);
    expect(w.map(x => R.effectiveTarget(s, x.i))).toEqual([50, 50, 50]);
    expect(w.every(x => x.sl.plan === undefined)).toBe(true);
  });
  it('a set with no values of its own carries the one before it', () => {
    const s = start(pyramid([{ load: 60 }, { reps: 8 }]), 0);
    const w = work(s);
    expect(w.map(x => (x.sl.step.kind === 'exercise' ? x.sl.step.forValue : 0))).toEqual([10, 8, 8]);
    expect(w.map(x => R.effectiveTarget(s, x.i))).toEqual([60, 60, 60]);
  });
  it('an adjustment carries forward until a round that prescribes its own load', () => {
    let s = tick(start(pyramid([{ load: 60 }, {}, { load: 80 }]), 0), 5000);
    s = adjust(s, 6000, 62.5);
    const w = work(s);
    expect(w.map(x => R.effectiveTarget(s, x.i))).toEqual([62.5, 62.5, 80]);
  });
  it('an adjustment never overrides a later prescribed set', () => {
    let s = tick(start(pyramid(full), 0), 5000);
    s = adjust(s, 6000, 65);
    expect(work(s).map(x => R.effectiveTarget(s, x.i))).toEqual([65, 70, 80]);
  });
  it('logs each set at its prescribed load and reps', () => {
    let s = tick(start(pyramid(full), 0), 5000);
    for (let t = 10000; s.phase !== 'done'; t += 10000) s = advance(s, t);
    expect(toResult(s, pyramid(full), 100000).steps[0].sets).toEqual([{ reps: 10, load: 60, at: 10 }, { reps: 8, load: 70, at: 30 }, { reps: 6, load: 80, at: 50 }]);
  });
  it('a swap drops the planned loads for the swap target, keeping the reps', () => {
    let s = tick(start(pyramid(full), 0), 5000);
    s = swap(s, 6000, 'pr', EX.bw_pushup, 0);
    expect(work(s).map(x => R.effectiveTarget(s, x.i))).toEqual([0, 0, 0]);
    expect(work(s).map(x => (x.sl.step.kind === 'exercise' ? x.sl.step.forValue : 0))).toEqual([10, 8, 6]);
  });
});

describe('the set grid', () => {
  const sheet = (): Runsheet => ({ id: 'g', title: 'Grid', items: [{ kind: 'block', id: 'b', name: 'Bench', repeat: 3, steps: [{ ...makeExercise(EX.db_incline_press, { target: 20, forMode: 'reps', forValue: 8 }), id: 'pr' }, { ...makeRest(60), id: 'r' }] }] });
  const ids = (s: R.RunState) => s.slots.filter(x => x.kind === 'work').map(x => x.id);

  it('the tick on the running set is Done', () => {
    let s = tick(start(sheet(), 0), 5000);
    s = R.completeSet(s, 20000, ids(s)[0]);
    expect(s.i).toBe(1);
    expect(s.actuals[ids(s)[0]].doneAt).toBe(20000);
  });
  it('a set still to come takes its load ahead, and a later set inherits it', () => {
    let s = tick(start(sheet(), 0), 5000);
    s = R.adjustAt(s, 6000, ids(s)[1], 25);
    expect(ids(s).map(id => R.targetOf(s, s.slots.find(x => x.id === id)!))).toEqual([20, 25, 25]);
  });
  it('a done set is locked until it is un-ticked, then logs the corrected weight', () => {
    let s = tick(start(sheet(), 0), 5000);
    const [first] = ids(s);
    s = advance(s, 20000);
    s = R.adjustAt(s, 21000, first, 22.5);
    expect(R.effectiveTarget(s, 0)).toBe(20);
    s = R.reopenSet(s, first);
    expect(s.actuals[first].doneAt).toBeUndefined();
    s = R.adjustAt(s, 22000, first, 22.5);
    s = R.setRepsAt(s, first, 7);
    s = R.completeSet(s, 23000, first);
    expect(s.i).toBe(1); // the cursor did not move
    expect(toResult(s, sheet(), 30000).steps[0].sets).toEqual([{ reps: 7, load: 22.5, at: 23 }]);
  });
  it('a skipped set can be ticked afterwards', () => {
    let s = tick(start(sheet(), 0), 5000);
    const [first] = ids(s);
    s = advance(s, 20000, { skipped: true });
    expect(toResult(s, sheet(), 21000).steps).toEqual([]);
    s = R.completeSet(s, 21000, first);
    expect(toResult(s, sheet(), 22000).steps[0].sets).toEqual([{ reps: 8, load: 20, at: 21 }]);
    expect(s.blockDone.b).toBe(1);
  });
  it('ticking the next set during the rest ends the rest and logs the set in one tap', () => {
    let s = tick(start(sheet(), 0), 5000);
    s = advance(s, 20000); // set 1 done, rest running
    expect(s.slots[s.i].kind).toBe('rest');
    s = R.completeSet(s, 50000, ids(s)[1]);
    expect(s.actuals[ids(s)[1]].doneAt).toBe(50000);
    expect(s.slots[s.i].kind).toBe('rest'); // on to the rest after set 2
    expect(s.blockDone.b).toBe(2);
    expect(toResult(s, sheet(), 51000).steps[0].sets).toHaveLength(2);
  });
  it('a set not reached yet cannot be ticked', () => {
    const s = tick(start(sheet(), 0), 5000);
    expect(R.completeSet(s, 6000, ids(s)[2])).toBe(s);
  });
});

describe('set types', () => {
  // A warm-up at 40, two working sets at 60, then a drop set at 45 straight after the last.
  const sheet = (): Runsheet => ({
    id: 't',
    title: 'Types',
    items: [{ kind: 'block', id: 'b', name: 'Bench', repeat: 4, steps: [{ ...makeExercise(EX.db_incline_press, { target: 60, forMode: 'reps', forValue: 8 }), id: 'pr', sets: [{ load: 40, type: 'warmup' }, { load: 60 }, {}, { load: 45, type: 'drop' }] }, { ...makeRest(60), id: 'r' }] }],
  });
  const ids = (s: R.RunState) => s.slots.filter(x => x.kind === 'work').map(x => x.id);

  it('each set carries its planned type', () => {
    const s = start(sheet(), 0);
    expect(s.slots.map((_, i) => R.typeAt(s, i)).filter((_, i) => s.slots[i].kind === 'work')).toEqual(['warmup', 'normal', 'normal', 'drop']);
  });
  it('no rest before a drop set', () => {
    let s = tick(start(sheet(), 0), 5000);
    s = advance(s, 10000); // warm-up done → rest
    expect(s.slots[s.i].kind).toBe('rest');
    s = advance(s, 20000); // rest over → set 2
    s = advance(s, 30000); // set 2 done → rest
    s = advance(s, 40000); // rest over → set 3
    s = advance(s, 50000); // set 3 done: the drop set comes straight on
    expect(s.slots[s.i].id).toBe(ids(s)[3]);
    expect(s.phase).toBe('running');
  });
  it('a type changed on the grid counts, rest rule included', () => {
    let s = tick(start(sheet(), 0), 5000);
    s = R.setTypeAt(s, ids(s)[1], 'drop');
    s = advance(s, 10000);
    expect(s.slots[s.i].id).toBe(ids(s)[1]);
    s = R.setTypeAt(s, ids(s)[2], 'failure');
    expect(R.typeAt(s, s.slots.findIndex(x => x.id === ids(s)[2]))).toBe('failure');
  });
  it('logs the type on each set; a warm-up stays out of the old target and reps fields', () => {
    let s = tick(start(sheet(), 0), 5000);
    for (let t = 10000; s.phase !== 'done'; t += 10000) s = advance(s, t);
    const row = toResult(s, sheet(), 200000).steps[0];
    expect(row.sets?.map(x => x.type)).toEqual(['warmup', undefined, undefined, 'drop']);
    expect(row.sets?.map(x => x.load)).toEqual([40, 60, 60, 45]);
    expect(row.reps).toEqual([8, 8, 8]);
  });
});

describe('cap clock', () => {
  it('counts down the block cap and ignores uncapped blocks', () => {
    let s = tick(start(cindy(), 0), 5000);
    expect(R.capLeft(s, 5000)).toBe(60);
    expect(R.capLeft(s, 25000)).toBe(40);
    s = pause(s, 25000);
    expect(R.capLeft(s, 90000)).toBe(40);
    const plain = tick(start(interval(), 0), 5000);
    expect(R.capLeft(plain, 6000)).toBeUndefined();
  });
});

describe('rest controls', () => {
  const sheet = (): Runsheet => ({ id: 'g', title: 'Grid', items: [{ kind: 'block', id: 'b', name: 'Bench', repeat: 3, restBetweenSec: 90, steps: [{ ...makeExercise(EX.db_incline_press, { target: 20, forMode: 'reps', forValue: 8 }), id: 'pr' }, { ...makeRest(60), id: 'r' }] }] });
  const onRest = () => advance(tick(start(sheet(), 0), 5000), 20000); // set 1 done at 20 s, 60 s rest from there

  it('+15 s and −15 s move the running rest and its length', () => {
    let s = onRest();
    expect(s.slots[s.i].kind).toBe('rest');
    s = R.extendRest(s, 30000, 15);
    expect(s.endsAt).toBe(95000);
    expect(s.slots[s.i].seconds).toBe(75);
    s = R.extendRest(s, 31000, -15);
    s = R.extendRest(s, 32000, -15);
    expect(s.endsAt).toBe(65000);
    expect(s.slots[s.i].seconds).toBe(45);
  });
  it('taking more than is left ends the rest at the next tick', () => {
    let s = R.extendRest(onRest(), 75000, -15); // 5 s left
    expect(s.endsAt).toBe(75000);
    s = tick(s, 75000);
    expect(s.slots[s.i].step.id).toBe('b:between');
  });
  it('works on a paused rest', () => {
    let s = pause(onRest(), 30000); // 50 s left
    s = R.extendRest(s, 40000, 15);
    expect(s.remainingMs).toBe(65000);
    s = resume(s, 50000);
    expect(s.endsAt).toBe(115000);
  });
  it('the rest between rounds takes it too', () => {
    const s = tick(onRest(), 80000); // the step rest ends: the rest between rounds
    expect(s.slots[s.i].step.id).toBe('b:between');
    const before = s.endsAt!;
    expect(R.extendRest(s, 151000, 15).endsAt).toBe(before + 15000);
  });
  it('leaves work and an EMOM wait alone', () => {
    const work = tick(start(sheet(), 0), 5000);
    expect(R.extendRest(work, 6000, 15)).toBe(work);
    const emom: Runsheet = { id: 'e', title: 'E', items: [{ kind: 'block', id: 'b', name: 'E', repeat: 2, mode: 'emom', everySec: 60, steps: [{ ...makeExercise(EX.bw_burpee, { forMode: 'reps', forValue: 5 }), id: 'x' }] }] };
    const wait = advance(tick(start(emom, 0), 5000), 20000);
    expect(wait.slots[wait.i].untilBoundary).toBe(true);
    expect(R.extendRest(wait, 21000, 15)).toBe(wait);
  });
});

describe('last time into the set', () => {
  const range = (): Runsheet => ({ id: 'g', title: 'Grid', items: [{ kind: 'block', id: 'b', name: 'Bench', repeat: 3, steps: [{ ...makeExercise(EX.db_incline_press, { target: 20, forMode: 'reps', forValue: 8 }), forMax: 12, id: 'pr' }, { ...makeRest(60), id: 'r' }] }] });
  const ids = (s: R.RunState) => s.slots.filter(x => x.kind === 'work').map(x => x.id);

  it('fillSet puts load and reps on a set to come', () => {
    let s = tick(start(range(), 0), 5000);
    s = R.fillSet(s, 6000, ids(s)[1], { load: 22.5, reps: 10 });
    expect(R.targetOf(s, s.slots.find(x => x.id === ids(s)[1])!)).toBe(22.5);
    expect(s.actuals[ids(s)[1]].reps).toBe(10);
  });
  it('fillSet leaves a done set alone', () => {
    let s = advance(tick(start(range(), 0), 5000), 20000);
    const before = s;
    s = R.fillSet(s, 21000, ids(s)[0], { load: 30, reps: 12 });
    expect(s).toBe(before);
  });
  it('prefillReps fills a range from last time, set by set', () => {
    const last = [11, 10, 9];
    const s = R.prefillReps(start(range(), 0), (_, round) => last[round]);
    expect(ids(s).map(id => s.actuals[id]?.reps)).toEqual([11, 10, 9]);
    expect(toResult(advance(tick(s, 5000), 20000), range(), 21000).steps[0].sets?.[0].reps).toBe(11);
  });
  it('prefillReps leaves fixed reps, prescribed sets and circuits alone', () => {
    const fixed: Runsheet = { id: 'f', title: 'F', items: [{ kind: 'block', id: 'b', name: 'B', repeat: 2, steps: [{ ...makeExercise(EX.db_incline_press, { forMode: 'reps', forValue: 8 }), id: 'pr' }] }] };
    const f = start(fixed, 0);
    expect(R.prefillReps(f, () => 11)).toBe(f);
    const circuit: Runsheet = { id: 'c', title: 'C', items: [{ kind: 'block', id: 'b', name: 'B', repeat: 2, steps: [{ ...makeExercise(EX.bw_pullup, { forMode: 'max', forValue: 0 }), id: 'a' }, { ...makeExercise(EX.bw_pushup, { forMode: 'reps', forValue: 10 }), id: 'b2' }] }] };
    const c = start(circuit, 0);
    expect(R.prefillReps(c, () => 11)).toBe(c);
  });
});

describe('set times and round splits', () => {
  it('each set keeps its session time, pauses excluded', () => {
    const sheet: Runsheet = { id: 'p', title: 'Press', items: [{ kind: 'block', id: 'b', name: 'B', repeat: 2, steps: [{ ...makeExercise(EX.db_incline_press, { target: 20, forMode: 'reps', forValue: 8 }), id: 'pr' }] }] };
    let s = tick(start(sheet, 0), 5000);
    s = advance(s, 20000);
    s = pause(s, 25000);
    s = resume(s, 55000); // 30 s paused
    s = advance(s, 70000);
    const r = toResult(s, sheet, 70000);
    expect(r.steps[0].sets?.map(x => x.at)).toEqual([20, 40]);
    expect(r.splits).toBeUndefined(); // one exercise for sets: its times are on the sets
  });
  it('a circuit logs when each round finished', () => {
    let s = tick(start(interval(), 0), 5000);
    for (let t = 5000; t <= 200000 && s.phase !== 'done'; t += 1000) s = tick(s, t);
    const r = toResult(s, interval(), 200000);
    // swings 30 s, rest 10, press 30, rest 10: round 1's press done at 5 + 70 = 75 s
    expect(r.splits).toEqual([{ blockId: 'b', at: [75, 155], from: 5 }]);
  });
  it("an amrap's half round at the cap is not a split", () => {
    let s = tick(start(cindy(), 0), 5000);
    s = advance(s, 15000);
    s = advance(s, 25000); // round 1 at 25 s
    s = advance(s, 35000); // half of round 2
    s = tick(s, 65000); // cap
    const r = toResult(s, cindy(), 65000);
    expect(r.splits).toEqual([{ blockId: 'b', at: [25], from: 5 }]);
  });
  it('a round with a skipped exercise still closes when the next begins', () => {
    let s = tick(start(cindy(), 0), 5000);
    s = advance(s, 15000);
    s = advance(s, 25000, { skipped: true });
    s = advance(s, 35000);
    s = advance(s, 45000);
    expect(toResult(s, cindy(), 46000).splits).toEqual([{ blockId: 'b', at: [15, 45], from: 5 }]);
  });
  it('un-ticking a set drops its time', () => {
    const sheet: Runsheet = { id: 'p', title: 'Press', items: [{ kind: 'block', id: 'b', name: 'B', repeat: 2, steps: [{ ...makeExercise(EX.db_incline_press, { target: 20, forMode: 'reps', forValue: 8 }), id: 'pr' }] }] };
    let s = advance(tick(start(sheet, 0), 5000), 20000);
    const first = s.slots[0].id;
    s = R.reopenSet(s, first);
    expect(s.actuals[first].at).toBeUndefined();
    s = R.completeSet(s, 30000, first);
    expect(s.actuals[first].at).toBe(30);
  });
});

describe('only what was done is logged', () => {
  const ruled = (): Runsheet => ({ ...interval(), progression: { onSuccessKg: 2.5, deloadPct: 10, failAfter: 3 } });
  it('a step with sets left undone is not a success', () => {
    let s = tick(start(ruled(), 0), 5000);
    s = advance(s, 20000); // swings round 1
    for (let t = 21000; s.phase !== 'done'; t += 1000) s = advance(s, t, { skipped: true });
    const r = toResult(s, ruled(), 40000);
    expect(r.steps.map(x => x.stepId)).toEqual(['sw']);
    expect(r.steps[0].success).toBe(false);
  });
  it('every set done is a success', () => {
    let s = tick(start(ruled(), 0), 5000);
    for (let t = 6000; s.phase !== 'done'; t += 1000) s = advance(s, t);
    expect(toResult(s, ruled(), 20000).steps.every(x => x.success)).toBe(true);
  });
  it('a set short of its reps is a miss', () => {
    const sq = (): Runsheet => ({ id: 'q', title: 'Squat', items: [{ kind: 'block', id: 'b', name: 'B', repeat: 2, progression: { onSuccessKg: 2.5, deloadPct: 10, failAfter: 3 }, steps: [{ ...makeExercise(EX.bw_squat, { forMode: 'reps', forValue: 5, target: 60 }), id: 'q1' }] }] });
    let s = tick(start(sq(), 0), 5000);
    s = advance(s, 20000);
    s = R.setReps(s, 3);
    s = advance(s, 40000);
    expect(toResult(s, sq(), 40000).steps[0]).toMatchObject({ reps: [5, 3], success: false });
  });
  it('a step with no progression rule says nothing about success', () => {
    let s = tick(start(interval(), 0), 5000);
    for (let t = 6000; s.phase !== 'done'; t += 1000) s = advance(s, t);
    expect(toResult(s, interval(), 20000).steps.map(x => x.success)).toEqual([undefined, undefined]);
  });
});

describe('for time is scored on the scored block', () => {
  const ft = (): Runsheet => ({
    id: 'ft',
    title: 'Warm-up then for time',
    items: [
      { ...makeExercise(EX.bw_squat, { forMode: 'seconds', forValue: 30 }), id: 'wu', role: 'warmup' },
      { kind: 'block', id: 'b', name: 'For time', mode: 'fortime', repeat: 2, steps: [{ ...makeExercise(EX.bw_pullup, { forMode: 'reps', forValue: 5 }), id: 'pu' }, { ...makeExercise(EX.bw_pushup, { forMode: 'reps', forValue: 10 }), id: 'pp' }] },
    ],
  });
  const run = (pauseInBlock = 0) => {
    let s = tick(start(ft(), 0), 5000); // lead-in over, warm-up running
    s = tick(s, 35000); // warm-up done, parked at the gate
    expect(s.phase).toBe('ready');
    s = R.startBlock(s, 95000); // a minute at the gate
    s = advance(s, 105000);
    if (pauseInBlock) s = resume(pause(s, 106000), 106000 + pauseInBlock);
    const t = 105000 + pauseInBlock;
    s = advance(s, t + 10000);
    s = advance(s, t + 20000);
    s = advance(s, t + 30000);
    expect(s.phase).toBe('done');
    return toResult(s, ft(), t + 30000);
  };
  it('leaves out the lead-in, the gate and the warm-up', () => {
    const r = run();
    expect(r.durationSec).toBe(135);
    expect(r.score).toBe(40);
  });
  it('leaves out a pause inside the block', () => {
    expect(run(20000).score).toBe(40);
  });
  it('splits carry when the block began, for the race against last time', () => {
    expect(run().splits).toEqual([{ blockId: 'b', at: [115, 135], from: 95 }]);
  });
  it('a loose main step counts, as in Murph', () => {
    const murph: Runsheet = { id: 'm', title: 'Murph', items: [{ ...makeExercise(EX.bw_squat, { forMode: 'reps', forValue: 1 }), id: 'run1' }, { kind: 'block', id: 'b', name: 'B', mode: 'fortime', repeat: 1, steps: [{ ...makeExercise(EX.bw_pullup, { forMode: 'reps', forValue: 5 }), id: 'pu' }] }] };
    let s = tick(start(murph, 0), 5000);
    s = advance(s, 65000); // 60 s run
    s = R.startBlock(s, 125000); // a minute at the gate
    s = advance(s, 155000); // 30 s block
    expect(toResult(s, murph, 155000).score).toBe(90);
  });
});

describe('pause', () => {
  it('pausing the lead-in twice still resumes into the lead-in, and logs nothing', () => {
    let s = start(interval(), 0);
    s = resume(pause(s, 1000), 2000);
    s = resume(pause(s, 3000), 13000);
    expect(s.phase).toBe('lead');
    s = tick(s, 16000);
    expect(s.phase).toBe('running');
    expect(s.i).toBe(0);
    expect(Object.values(s.actuals).some(a => a.doneAt !== undefined)).toBe(false);
  });
  it('Done on a paused lead-in starts the first step without logging it', () => {
    let s = pause(start(interval(), 0), 1000);
    s = advance(s, 2000);
    expect(s.phase).toBe('running');
    expect(s.i).toBe(0);
    expect(s.actuals[s.slots[0].id]?.doneAt).toBeUndefined();
  });
  it('Done while paused does not count the pause as workout time', () => {
    let s = tick(start(interval(), 0), 5000);
    s = pause(s, 10000);
    s = advance(s, 70000);
    expect(s.phase).toBe('running');
    expect(s.i).toBe(1);
    expect(s.pausedMs).toBe(60000);
    expect(s.actuals[s.slots[0].id].at).toBe(10);
    expect(elapsed(s, 70000)).toBe(10);
  });
  it('a set ticked on a paused timer does not count the pause either', () => {
    let s = tick(start(interval(), 0), 5000);
    s = pause(s, 10000);
    s = R.completeSet(s, 70000, s.slots[0].id);
    expect(s.pausedMs).toBe(60000);
    expect(elapsed(s, 70000)).toBe(10);
  });
  it('finishing while paused does not count the pause', () => {
    let s = tick(start(interval(), 0), 5000);
    s = R.finish(pause(s, 10000), 70000);
    expect(toResult(s, interval(), 70000).durationSec).toBe(10);
  });
});

describe('emom', () => {
  const emom = (): Runsheet => ({ id: 'e', title: 'EMOM', items: [{ kind: 'block', id: 'b', name: 'E', mode: 'emom', everySec: 60, repeat: 3, steps: [{ ...makeExercise(EX.bw_burpee, { forMode: 'reps', forValue: 5 }), id: 'x' }] }] });
  it('shows what is left of the minute on the work', () => {
    const s = tick(start(emom(), 0), 5000);
    expect(R.minuteLeft(s, 25000)).toBe(40);
    expect(R.minuteLeft(tick(start(interval(), 0), 5000), 25000)).toBeUndefined();
  });
  it('an overrun minute does not add a minute', () => {
    let s = tick(start(emom(), 0), 5000);
    s = advance(s, 75000); // minute 1 took 70 s
    expect(s.slots[s.i].kind).toBe('work');
    expect(s.slots[s.i].round).toBe(1);
    s = advance(s, 80000);
    expect(s.endsAt).toBe(125000); // minute 2 ends on its boundary
    s = tick(s, 125000);
    s = advance(s, 130000);
    s = tick(s, 185000);
    expect(s.phase).toBe('done');
  });
});

describe('previous step', () => {
  const two = (cap?: number): Runsheet => ({
    id: 'two',
    title: 'Two for time',
    items: [
      { kind: 'block', id: 'a', name: 'A', mode: 'fortime', repeat: 1, ...(cap ? { timeCapSec: cap } : {}), steps: [{ ...makeExercise(EX.bw_pullup, { forMode: 'reps', forValue: 5 }), id: 'pa' }] },
      { kind: 'block', id: 'b', name: 'B', mode: 'fortime', repeat: 1, steps: [{ ...makeExercise(EX.bw_pushup, { forMode: 'reps', forValue: 10 }), id: 'pb' }] },
    ],
  });
  it('back and forth across blocks counts the time once', () => {
    let s = tick(start(two(), 0), 5000); // A from 5 s
    s = advance(s, 65000); // A done at 65 s, parked at B's gate
    s = R.startBlock(s, 65000);
    s = R.back(s, 95000); // 30 s into B, back to A
    expect(s.i).toBe(0);
    s = advance(s, 100000);
    s = R.startBlock(s, 100000);
    s = advance(s, 130000);
    expect(s.phase).toBe('done');
    expect(toResult(s, two(), 130000).score).toBe(125);
  });
  it('back at a gate does not reopen a capped block whose cap has passed', () => {
    let s = tick(start(two(60), 0), 5000);
    s = advance(s, 20000); // A done, parked at B's gate
    expect(s.phase).toBe('ready');
    const back = R.back(s, 100000); // A's cap ran out at 65 s
    expect(back.i).toBe(s.i);
    expect(back.phase).toBe('ready');
    expect(back.actuals[s.slots[0].id]?.doneAt).toBe(20000);
    expect(toResult(back, two(60), 100000).steps.map(x => x.stepId)).toEqual(['pa']);
  });
  it('back at a gate into a capped block with time left reopens its last set', () => {
    let s = tick(start(two(60), 0), 5000);
    s = advance(s, 20000);
    s = R.back(s, 30000);
    expect(s.i).toBe(0);
    expect(s.phase).toBe('running');
    expect(s.actuals[s.slots[0].id]?.doneAt).toBeUndefined();
  });
  it('going back un-logs the step, so an amrap round is not counted twice', () => {
    let s = tick(start(cindy(), 0), 5000);
    s = advance(s, 10000);
    expect(s.blockDone.b).toBe(1);
    s = R.back(s, 11000);
    expect(s.i).toBe(0);
    expect(s.blockDone.b).toBe(0);
    expect(s.actuals[s.slots[0].id]?.doneAt).toBeUndefined();
    s = advance(s, 12000);
    expect(s.blockDone.b).toBe(1);
  });
});

describe('a run kept on the device', () => {
  it('comes back only for its own workout, paused where it was left', () => {
    const s = tick(start(interval(), 0), 5000);
    R.persist(s);
    expect(R.loadPersisted('c')).toBeNull();
    const back = R.loadPersisted('i');
    expect(back?.state.i).toBe(0);
    const resumed = R.restore(back!.state, 20000);
    expect(resumed.phase).toBe('paused');
    expect(elapsed(resumed, 999999)).toBe(20);
    R.clearPersisted();
  });
});

describe('timed and distance work', () => {
  const plank = (): Runsheet => ({ id: 'pl', title: 'Plank', items: [{ kind: 'block', id: 'b', name: 'B', repeat: 2, steps: [{ ...makeExercise(EX.bw_plank, { forMode: 'seconds', forValue: 60 }), id: 'p' }, { ...makeRest(30), id: 'r' }] }] });
  const row = (): Runsheet => ({ id: 'rw', title: 'Row', items: [{ ...makeExercise(EX.cardio_rower, { forMode: 'meters', forValue: 500 }), id: 'rw' }] });
  it('a countdown that runs out logs its whole length', () => {
    let s = tick(start(plank(), 0), 5000);
    s = tick(s, 5000 + 60000 + 400); // a late tick
    const r = toResult(s, plank(), 70000);
    expect(r.steps[0].sets?.[0].seconds).toBe(60);
    expect(r.steps[0].sets?.[0].load).toBeUndefined(); // seconds is the plank's unit, not a load
  });
  it('Done early keeps the time it ran, pauses out; Skip logs nothing', () => {
    let s = tick(start(plank(), 0), 5000);
    s = pause(s, 25000);
    s = resume(s, 40000); // 15 s paused
    s = advance(s, 57000); // 20 + 17 s held
    expect(s.actuals[s.slots[0].id].seconds).toBe(37);
    s = advance(s, 60000, { skipped: true }); // the rest
    s = advance(s, 70000, { skipped: true }); // round 2 skipped
    const r = toResult(s, plank(), 70000);
    expect(r.steps[0].sets?.map(x => x.seconds)).toEqual([37]);
  });
  it('a distance logs the plan unless changed, and the time it took', () => {
    let s = tick(start(row(), 0), 5000);
    expect(R.amountAt(s, s.slots[0])).toBe(500);
    let r = toResult(advance(s, 5000 + 101000), row(), 110000);
    expect(r.steps[0].sets?.[0]).toMatchObject({ meters: 500, seconds: 101 });
    s = R.setAmount(s, 480);
    r = toResult(advance(s, 5000 + 99000), row(), 110000);
    expect(r.steps[0].sets?.[0]).toMatchObject({ meters: 480, seconds: 99 });
    expect(r.steps[0].sets?.[0].load).toBeUndefined();
  });
  it('a rower on the clock logs metres only when entered', () => {
    const sheet: Runsheet = { id: 't', title: 'T', items: [{ ...makeExercise(EX.cardio_rower, { forMode: 'minutes', forValue: 2 }), id: 'x' }] };
    let s = tick(start(sheet, 0), 5000);
    expect(R.amountField(s.slots[0])).toBe('meters');
    expect(R.amountAt(s, s.slots[0])).toBeUndefined();
    s = R.setAmount(s, 540);
    s = tick(s, 5000 + 120000);
    expect(toResult(s, sheet, 130000).steps[0].sets?.[0]).toMatchObject({ meters: 540, seconds: 120 });
  });
  it('calories count on a calorie step; a set of reps keeps no time', () => {
    const sheet: Runsheet = { id: 'c', title: 'C', items: [{ kind: 'block', id: 'b', name: 'B', repeat: 1, steps: [{ ...makeExercise(EX.cardio_assault_bike, { forMode: 'calories', forValue: 20 }), id: 'bk' }, { ...makeExercise(EX.bw_pushup, { forMode: 'reps', forValue: 10 }), id: 'pu' }] }] };
    let s = tick(start(sheet, 0), 5000);
    s = R.setAmount(s, 22);
    s = advance(s, 45000);
    s = advance(s, 65000);
    const r = toResult(s, sheet, 65000);
    expect(r.steps[0].sets?.[0]).toMatchObject({ calories: 22, seconds: 40 });
    expect(r.steps[1].sets?.[0].seconds).toBeUndefined();
  });
  it('a done set is locked until un-ticked', () => {
    let s = tick(start(row(), 0), 5000);
    s = advance(s, 105000);
    const id = s.slots[0].id;
    expect(R.setAmountAt(s, id, 400)).toBe(s);
  });
  it('a set ticked straight after its rest has no time of its own', () => {
    const sheet: Runsheet = { id: 'h', title: 'H', items: [{ kind: 'block', id: 'b', name: 'B', repeat: 2, restBetweenSec: 60, steps: [{ ...makeExercise(EX.bw_plank, { forMode: 'max', forValue: 0 }), id: 'h' }] }] };
    let s = tick(start(sheet, 0), 5000);
    s = advance(s, 50000); // 45 s hold
    s = R.completeSet(s, 60000, s.slots[2].id); // ends the rest and ticks set 2 at once
    const r = toResult(s, sheet, 60000);
    expect(r.steps[0].sets?.map(x => x.seconds)).toEqual([45, undefined]);
  });
  it('for-time rounds are split per round', () => {
    const sheet: Runsheet = { id: 'f', title: 'F', items: [{ kind: 'block', id: 'b', name: 'F', mode: 'fortime', repeat: 3, steps: [{ ...makeExercise(EX.bw_pullup, { forMode: 'reps', forValue: 5 }), id: 'a' }, { ...makeExercise(EX.bw_pushup, { forMode: 'reps', forValue: 10 }), id: 'c' }] }] };
    let s = tick(start(sheet, 0), 5000);
    for (const t of [20, 40, 70, 95, 130, 150]) s = advance(s, t * 1000);
    expect(toResult(s, sheet, 150000).splits).toEqual([{ blockId: 'b', at: [40, 95, 150], from: 5 }]);
  });
});
