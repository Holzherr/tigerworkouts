/**
 * The timer on the gym floor: a gate that holds through a swap, EMOM minutes that move on by
 * themselves, circuits that end cleanly or early, a capped for-time that is not a finish, and the
 * progression rules reading drop sets, warm-ups and dropped lifts truthfully. Ported one for one to
 * `ios/TigerWorkoutsTests/GymFloorTests.swift`.
 */
import { describe, expect, it } from 'vitest';
import { EX } from '@/features/runsheet/fixtures';
import { makeExercise, makeRest, type Block, type Runsheet, type SetPlan } from '@/features/runsheet/model';
import { scoreTarget } from '@/features/runsheet/targets';
import { roundTimes } from '@/features/results/rounds';
import * as R from './runner';

const ex = (id: string, key: keyof typeof EX, init: Parameters<typeof makeExercise>[1] = {}) => ({ ...makeExercise(EX[key], init), id });
const done = (s: R.RunState, from: number, step = 1000) => {
  let t = from;
  while (s.phase !== 'done' && s.phase !== 'ready') s = R.advance(s, (t += step));
  return { s, t };
};

describe('a gate holds through a swap or a drop', () => {
  const two = (): Runsheet => ({
    id: 'g2',
    title: 'Two blocks',
    items: [
      { kind: 'block', id: 'b1', name: 'Warm', repeat: 1, steps: [ex('w', 'bw_squat', { forMode: 'reps', forValue: 10 })] },
      { kind: 'block', id: 'b2', name: 'Cindy', mode: 'amrap', timeCapSec: 300, repeat: 1, steps: [ex('row', 'row_erg', { forMode: 'calories', forValue: 10 }), ex('p', 'bw_pushup', { forMode: 'reps', forValue: 10 })] },
    ],
  });
  const atGate = () => R.advance(R.tick(R.start(two(), 0), 5000), 10000);

  it('swapping the first exercise at the gate keeps the block parked', () => {
    const gate = atGate();
    expect(gate.phase).toBe('ready');
    const s = R.swap(gate, 20000, 'row', EX.bw_burpee);
    expect(s.phase).toBe('ready');
    expect(s.blockStart.b2).toBeUndefined();
    const step = R.current(s)?.step;
    expect(step?.kind === 'exercise' && step.exercise.key).toBe('bw_burpee');
  });
  it('dropping the first exercise at the gate keeps the block parked on the next one', () => {
    const s = R.drop(atGate(), 20000, 'row');
    expect(s.phase).toBe('ready');
    expect(s.blockStart.b2).toBeUndefined();
    expect(R.current(s)?.step.id).toBe('p');
  });
  it('a swap on a paused set keeps it paused', () => {
    let s = R.startBlock(atGate(), 20000); // Get ready
    s = R.tick(s, 25000);
    s = R.pause(s, 30000);
    s = R.swap(s, 40000, 'row', EX.bw_burpee);
    expect(s.phase).toBe('paused');
  });
});

describe('progression reads what was done', () => {
  const ruled = (sets?: SetPlan[], repeat = 3): Runsheet => ({
    id: 'ss',
    title: 'Bench',
    progression: { onSuccessKg: 2.5, deloadPct: 10, failAfter: 3 },
    items: [{ kind: 'block', id: 'b', name: 'Bench', repeat, steps: [{ ...ex('pr', 'db_incline_press', { target: 60, forMode: 'reps', forValue: 8 }), ...(sets ? { sets } : {}) }] }],
  });

  it('a drop set with fewer reps is not a miss', () => {
    const r = ruled([{}, {}, {}, { type: 'drop' }], 4);
    let s = R.tick(R.start(r, 0), 5000);
    const drop = s.slots.filter(x => x.kind === 'work')[3].id;
    s = R.setRepsAt(s, drop, 6);
    s = done(s, 5000).s;
    expect(R.toResult(s, r, 60000).steps[0].success).toBe(true);
  });
  it('a planned drop set left undone is not a miss', () => {
    const r = ruled([{}, {}, {}, { type: 'drop' }], 4);
    let s = R.tick(R.start(r, 0), 5000);
    for (let k = 0; k < 3; k++) s = R.advance(s, 6000 + k * 1000);
    s = R.finish(s, 20000);
    expect(R.toResult(s, r, 20000).steps[0].success).toBe(true);
  });
  it('a lift dropped after two of four sets is a miss', () => {
    const r = ruled(undefined, 4);
    let s = R.tick(R.start(r, 0), 5000);
    s = R.advance(R.advance(s, 6000), 7000);
    s = R.drop(s, 8000, 'pr');
    expect(s.phase).toBe('done');
    const res = R.toResult(s, r, 8000);
    expect(res.steps[0].sets).toHaveLength(2);
    expect(res.steps[0].success).toBe(false);
  });
  it("a warm-up's load does not carry into the working sets", () => {
    const r = ruled();
    let s = R.tick(R.start(r, 0), 5000);
    const [w, a, b] = s.slots.filter(x => x.kind === 'work').map(x => x.id);
    s = R.setTypeAt(s, w, 'warmup');
    s = R.adjustAt(s, 6000, w, 40);
    expect(R.targetOf(s, s.slots.find(x => x.id === w)!)).toBe(40);
    expect(R.targetOf(s, s.slots.find(x => x.id === a)!)).toBe(60);
    s = R.setTypeAt(s, a, 'drop');
    s = R.adjustAt(s, 6000, a, 45);
    expect(R.targetOf(s, s.slots.find(x => x.id === b)!)).toBe(60);
  });
});

describe('circuits end cleanly', () => {
  const circuit = (between?: number): Runsheet => ({
    id: 'c',
    title: 'Circuit',
    items: [{ kind: 'block', id: 'b', name: 'Circuit', repeat: 3, ...(between ? { restBetweenSec: between } : {}), steps: [ex('a', 'kb_swing', { forValue: 40 }), { ...makeRest(20), id: 'r1' }, ex('c', 'bw_burpee', { forValue: 40 }), { ...makeRest(20), id: 'r2' }] }],
  });

  it('the last round has no rest after its last exercise', () => {
    const slots = R.expand(circuit());
    expect(slots.at(-1)?.step.id).toBe('c');
    expect(slots.filter(x => x.step.id === 'r2')).toHaveLength(2);
  });
  it('a rest between rounds stands in for the rest after the last exercise', () => {
    const slots = R.expand(circuit(90));
    expect(slots.map(x => x.step.id)).toEqual(['a', 'r1', 'c', 'b:between', 'a', 'r1', 'c', 'b:between', 'a', 'r1', 'c']);
  });
  it('straight sets end on the last set', () => {
    const slots = R.expand({ title: 't', items: [{ kind: 'block', id: 'b', name: 'B', repeat: 3, steps: [ex('pr', 'db_incline_press', { forMode: 'reps', forValue: 8 }), { ...makeRest(90), id: 'r' }] }] });
    expect(slots.map(x => x.kind)).toEqual(['work', 'rest', 'work', 'rest', 'work']);
  });
  it('End this block skips what is left of it and parks at the next gate', () => {
    const r: Runsheet = { ...circuit(), items: [...circuit().items, { kind: 'block', id: 'b2', name: 'Next', repeat: 1, steps: [ex('n', 'bw_squat', { forMode: 'reps', forValue: 10 })] }] };
    let s = R.tick(R.start(r, 0), 5000);
    s = R.tick(s, 45000); // swings done, on the rest
    s = R.endBlock(s, 50000);
    expect(s.phase).toBe('ready');
    expect(R.current(s)?.blockId).toBe('b2');
    s = done(R.startBlock(s, 60000), 60000).s;
    const res = R.toResult(s, r, 70000);
    expect(res.steps.find(x => x.stepId === 'a')?.sets).toHaveLength(1);
    expect(res.steps.some(x => x.stepId === 'c')).toBe(false);
    expect(res.completed).toBe(false);
  });
  it('End this block on the last block ends the session', () => {
    const s = R.endBlock(R.tick(R.start(circuit(), 0), 5000), 10000);
    expect(s.phase).toBe('done');
  });
});

describe('EMOM minutes move on by themselves', () => {
  const emom = (n = 2): Runsheet => ({ id: 'e', title: 'EMOM', items: [{ kind: 'block', id: 'b', name: 'E', mode: 'emom', repeat: n, everySec: 60, steps: [ex('x', 'bw_burpee', { forMode: 'reps', forValue: 5 }), ex('y', 'bw_pushup', { forMode: 'reps', forValue: 10 })] }] });

  it('the work counts down to the minute, so the last three seconds get their tones', () => {
    const s = R.tick(R.start(emom(), 0), 5000);
    expect(R.current(s)?.step.id).toBe('x');
    expect(s.endsAt).toBe(65000);
    expect(R.clock(s, 62000).left).toBe(3);
    expect(R.minuteOnly(R.current(s))).toBe(true);
  });
  it('an untapped minute logs its sets as planned and starts the next minute', () => {
    let s = R.tick(R.start(emom(), 0), 5000);
    s = R.tick(s, 65000);
    expect(R.current(s)?.step.id).toBe('x');
    expect(R.current(s)?.round).toBe(1);
    expect(s.phase).toBe('running');
    s = R.tick(s, 125000);
    expect(s.phase).toBe('done');
    const res = R.toResult(s, emom(), 125000);
    expect(res.steps.map(x => x.reps)).toEqual([[5, 5], [10, 10]]);
  });
  it('Done early still waits out the minute', () => {
    let s = R.tick(R.start(emom(), 0), 5000);
    s = R.advance(R.advance(s, 20000), 35000);
    expect(R.current(s)?.untilBoundary).toBe(true);
    s = R.tick(s, 65000);
    expect(R.current(s)?.round).toBe(1);
    expect(R.current(s)?.step.id).toBe('x');
  });
  it('a timed EMOM set keeps its own countdown inside the minute', () => {
    const r: Runsheet = { id: 't', title: 'T', items: [{ kind: 'block', id: 'b', name: 'E', mode: 'emom', repeat: 2, everySec: 60, steps: [ex('x', 'kb_swing', { forValue: 40 })] }] };
    const s = R.tick(R.start(r, 0), 5000);
    expect(s.endsAt).toBe(45000);
    expect(R.minuteOnly(R.current(s))).toBe(false);
  });
});

describe('caps', () => {
  const fran = (cap: number | undefined): Runsheet => ({ id: 'f', title: 'Fran', score: 'time', items: [{ kind: 'block', id: 'b', name: 'Fran', mode: 'fortime', repeat: 3, ...(cap !== undefined ? { timeCapSec: cap } : {}), steps: [ex('t', 'kb_swing', { forMode: 'reps', forValue: 21 }), ex('p', 'bw_pullup', { forMode: 'reps', forValue: 21 })] }] });

  it('a for-time capped before the end is saved as capped with the reps reached, not a finish', () => {
    let s = R.tick(R.start(fran(120), 0), 5000);
    s = R.advance(s, 30000); // 21 swings
    s = R.setReps(s, 12);
    s = R.tick(s, 125000); // the cap
    expect(s.phase).toBe('done');
    const res = R.toResult(s, fran(120), 125000);
    expect(res.completed).toBe(false);
    expect(res.capped).toBe(true);
    expect(res.capReps).toBe(21);
    expect(res.scoreText).toBe('Capped · 21 reps');
    expect(res.score).toBe(120);
    // Next time's target is not "Finish in under 2:00".
    expect(scoreTarget(fran(120), [{ ...res, id: 'x' }])).toBeUndefined();
  });
  it('a for-time finished inside its cap is a finish', () => {
    const s = done(R.tick(R.start(fran(600), 0), 5000), 5000).s;
    const res = R.toResult(s, fran(600), 20000);
    expect(res.completed).toBe(true);
    expect(res.capped).toBeUndefined();
  });
  it('a cap of 0 is no cap', () => {
    expect(R.expand(fran(0))[0].capSec).toBeUndefined();
    const amrap: Runsheet = { title: 'a', items: [{ kind: 'block', id: 'b', name: 'A', mode: 'amrap', timeCapSec: 0, repeat: 1, steps: [ex('p', 'bw_pushup', { forMode: 'reps', forValue: 10 })] }] };
    expect(R.expand(amrap)[0].capSec).toBeUndefined();
  });
});

describe('Get ready before a block on a clock', () => {
  const sheet = (second: Block): Runsheet => ({ id: 'g', title: 'G', items: [{ kind: 'block', id: 'b1', name: 'One', repeat: 1, steps: [ex('w', 'bw_squat', { forMode: 'reps', forValue: 10 })] }, second] });
  const gate = (r: Runsheet) => R.advance(R.tick(R.start(r, 0), 5000), 10000);

  it('an AMRAP starts after five seconds, its clock from then', () => {
    const r = sheet({ kind: 'block', id: 'b2', name: 'A', mode: 'amrap', timeCapSec: 300, repeat: 1, steps: [ex('p', 'bw_pushup', { forMode: 'reps', forValue: 10 })] });
    let s = R.startBlock(gate(r), 20000);
    expect(s.phase).toBe('lead');
    expect(R.clock(s, 21000).left).toBe(4);
    s = R.tick(s, 25000);
    expect(s.phase).toBe('running');
    expect(s.blockStart.b2).toBe(25000);
  });
  it('Skip on the Get ready starts the block at once', () => {
    const r = sheet({ kind: 'block', id: 'b2', name: 'E', mode: 'emom', everySec: 60, repeat: 2, steps: [ex('p', 'bw_pushup', { forMode: 'reps', forValue: 10 })] });
    const s = R.advance(R.startBlock(gate(r), 20000), 21000, { skipped: true });
    expect(s.phase).toBe('running');
    expect(s.blockStart.b2).toBe(21000);
  });
  it('straight sets start on the tap', () => {
    const r = sheet({ kind: 'block', id: 'b2', name: 'Bench', repeat: 3, steps: [ex('pr', 'db_incline_press', { forMode: 'reps', forValue: 8 })] });
    expect(R.startBlock(gate(r), 20000).phase).toBe('running');
  });
});

describe('a kept run and round times', () => {
  it('a run kept at a gate does not count the time away', () => {
    const r: Runsheet = { id: 'k', title: 'K', items: [{ kind: 'block', id: 'b1', name: 'One', repeat: 1, steps: [ex('w', 'bw_squat', { forMode: 'reps', forValue: 10 })] }, { kind: 'block', id: 'b2', name: 'Two', repeat: 1, steps: [ex('p', 'bw_pushup', { forMode: 'reps', forValue: 10 })] }] };
    const gate = R.advance(R.tick(R.start(r, 0), 5000), 10000);
    expect(gate.phase).toBe('ready');
    const back = R.restore(gate, 20000, 3620000); // an hour closed
    expect(R.elapsed(back, 3620000)).toBe(R.elapsed(gate, 20000));
  });
  it('a round is timed from when its work began, not from the round before it', () => {
    // Two rounds of 20 s work and a 60 s rest between: both rounds took 20 s.
    const r: Runsheet = { id: 'c', title: 'C', items: [{ kind: 'block', id: 'b', name: 'B', repeat: 2, restBetweenSec: 60, steps: [ex('a', 'kb_swing', { forValue: 10 }), ex('c', 'bw_burpee', { forValue: 10 })] }] };
    let s = R.tick(R.start(r, 0), 5000);
    for (let t = 5000; t <= 120000 && s.phase !== 'done'; t += 1000) s = R.tick(s, t);
    const sp = R.toResult(s, r, 120000).splits![0];
    expect(sp.starts).toEqual([5, 85]); // session time, lead-in included, as `at` is
    expect(roundTimes(sp)).toEqual([20, 20]);
  });
});
