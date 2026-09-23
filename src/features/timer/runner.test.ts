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
