import { describe, expect, it } from 'vitest';
import { flatten, fromLegacy, groupOnto, insertAfter, makeExercise, makeRest, moveRow, rebuild, removeStep, runsheetSeconds, type Block, type ExerciseRef, type Item } from './model';

const KB: ExerciseRef = { key: 'kb_swing', name: 'Kettlebell swings', unit: 'kg', step: 4 };
const PRESS: ExerciseRef = { key: 'db_incline_press', name: 'Incline chest press', unit: 'kg per arm', step: 2.5 };
const SPRINT: ExerciseRef = { key: 'sprint', name: 'Treadmill sprints', unit: 'kph', step: 0.5 };

const swings = () => makeExercise(KB, { target: 28 });
const press = () => makeExercise(PRESS, { target: 20 });
const block = (steps: Block['steps'], repeat = 8): Block => ({ kind: 'block', id: 'b1', name: 'B', repeat, steps });

describe('timing', () => {
  it('sums block rounds and loose steps', () => {
    const items: Item[] = [block([swings(), makeRest(30), press(), makeRest(30)], 8), makeExercise(SPRINT, { forMode: 'minutes', forValue: 10 })];
    expect(runsheetSeconds({ items })).toBe(120 * 8 + 600);
  });
});

describe('removeStep', () => {
  it('dissolves a block left with one step', () => {
    const a = swings();
    const b = press();
    const out = removeStep([block([a, b])], b.id);
    expect(out).toEqual([a]);
  });
  it('drops an emptied block', () => {
    const a = swings();
    expect(removeStep([block([a])], a.id)).toEqual([]);
  });
});

describe('insertAfter', () => {
  it('inserts inside the block when the anchor is a block step', () => {
    const a = swings();
    const b = press();
    const r = makeRest(15);
    const out = insertAfter([block([a, b])], a.id, r) as Block[];
    expect(out[0].steps.map(s => s.id)).toEqual([a.id, r.id, b.id]);
  });
  it('inserts first in the block when the anchor is the block itself', () => {
    const a = swings();
    const r = makeRest(15);
    const out = insertAfter([block([a, press()])], 'b1', r) as Block[];
    expect(out[0].steps[0].id).toBe(r.id);
  });
});

describe('groupOnto', () => {
  it('makes a block from two loose steps with a rest between', () => {
    const a = swings();
    const b = press();
    const out = groupOnto([a, b], b.id, a.id, { autoRest: 30 });
    expect(out).toHaveLength(1);
    const blk = out[0] as Block;
    expect(blk.kind).toBe('block');
    expect(blk.steps.map(s => s.kind)).toEqual(['exercise', 'rest', 'exercise']);
    expect(blk.name).toBe('Kettlebell swings + Incline chest press');
  });
  it('adds a loose step to an existing block when dropped on one of its steps', () => {
    const a = swings();
    const b = press();
    const c = makeExercise(SPRINT);
    const out = groupOnto([block([a, b]), c], c.id, a.id);
    expect(out).toHaveLength(1);
    expect((out[0] as Block).steps.map(s => s.id)).toEqual([a.id, b.id, c.id]);
  });
});

describe('flatten / rebuild / moveRow', () => {
  it('round-trips', () => {
    const items: Item[] = [block([swings(), makeRest(30), press()]), makeExercise(SPRINT)];
    expect(rebuild(flatten(items))).toEqual(items);
  });
  it('moves a step out of a block past the end marker', () => {
    const a = swings();
    const b = press();
    const c = makeExercise(SPRINT);
    const out = moveRow([block([a, b, c])], c.id, 'b1:end');
    expect(out).toHaveLength(2);
    expect(out[1].id).toBe(c.id);
  });
  it('dissolves a block when dragging out leaves one step', () => {
    const a = swings();
    const b = press();
    const out = moveRow([block([a, b])], b.id, 'b1:end');
    expect(out.map(i => i.id)).toEqual([a.id, b.id]);
  });
  it('moves a whole block as a chunk', () => {
    const a = swings();
    const loose = makeExercise(SPRINT);
    const out = moveRow([block([a, press()]), loose], 'b1', loose.id);
    expect(out.map(i => i.kind)).toEqual(['exercise', 'block']);
    expect((out[1] as Block).steps).toHaveLength(2);
  });
});

describe('fromLegacy', () => {
  it('turns an interval block into exercise/rest steps with the round count', () => {
    const lib = { kb_swing: KB, db_incline_press: PRESS };
    const r = fromLegacy(
      { id: 'w', title: 'T', blocks: [{ type: 'interval', name: 'Swings + press', work_s: 30, rest_s: 30, rounds: 8, exercises: [{ ex: 'kb_swing', target: 28 }, { ex: 'db_incline_press', target: 15 }] }] },
      lib
    );
    const b = r.items[0] as Block;
    expect(b.repeat).toBe(8);
    expect(b.steps.map(s => s.kind)).toEqual(['exercise', 'rest', 'exercise', 'rest']);
    expect(runsheetSeconds(r)).toBe(120 * 8);
  });
});
