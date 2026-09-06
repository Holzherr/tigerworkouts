import { describe, expect, it } from 'vitest';
import { EX } from '@/features/runsheet/fixtures';
import { makeExercise, makeRest, type Block, type Runsheet } from '@/features/runsheet/model';
import { adjust, advance, drop, elapsed, expand, pause, resume, start, tick, toResult } from './runner';

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
