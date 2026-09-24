import { describe, expect, it } from 'vitest';
import { groupOnto, moveRow, removeStep, replaceStep, updateBlock, type ExerciseStep, type Runsheet } from './model';
import { patchStep } from './patch-step';
import { applySettings, classifyEdit, cleared, hasSettings, mergeSettings, newVersion, settingsChange, withChange, type WorkoutSettings } from './settings';

const press = { key: 'db_incline_press', name: 'Incline chest press', unit: 'kg per arm', step: 2.5 };
const swing = { key: 'kb_swing', name: 'Kettlebell swing', unit: 'kg', step: 4 };
const row = { key: 'cardio_rower', name: 'Rowing machine', unit: '', step: 1 };

const sheet = (): Runsheet => ({
  id: 'fran',
  title: 'Swings & press',
  items: [
    { kind: 'block', id: 'b1', name: 'Pair', repeat: 8, steps: [{ kind: 'exercise', id: 'e1', exercise: swing, target: 24, forMode: 'reps', forValue: 15 }, { kind: 'rest', id: 'r1', seconds: 30 }, { kind: 'exercise', id: 'e2', exercise: press, target: 15, forMode: 'reps', forValue: 10 }] },
    { kind: 'exercise', id: 'e3', exercise: row, forMode: 'seconds', forValue: 60 },
  ],
});
const T = '2026-09-23T08:00:00.000Z';
const block = (r: Runsheet) => r.items[0] as Extract<Runsheet['items'][number], { kind: 'block' }>;

describe('settings or a new setup', () => {
  it('numbers only are settings: weight, reps, rest, rounds', () => {
    const r = sheet();
    expect(classifyEdit(r, patchStep(r, 'e2', { target: 17.5 }))).toBe('settings');
    expect(classifyEdit(r, { ...r, items: replaceStep(r.items, 'e1', { ...(block(r).steps[0] as ExerciseStep), forValue: 20 }) })).toBe('settings');
    expect(classifyEdit(r, { ...r, items: replaceStep(r.items, 'r1', { kind: 'rest', id: 'r1', seconds: 20 }) })).toBe('settings');
    expect(classifyEdit(r, { ...r, items: updateBlock(r.items, 'b1', { repeat: 6 }) })).toBe('settings');
    expect(classifyEdit(r, patchStep(r, 'e3', { incline: 2 }))).toBe('settings');
  });

  it('adding, removing, reordering, grouping, swapping and renaming are a new setup', () => {
    const r = sheet();
    expect(classifyEdit(r, { ...r, items: removeStep(r.items, 'e3') })).toBe('structure');
    expect(classifyEdit(r, { ...r, items: moveRow(r.items, 'e3', 'b1') })).toBe('structure');
    expect(classifyEdit(r, { ...r, items: groupOnto(r.items, 'e3', 'e1') })).toBe('structure');
    expect(classifyEdit(r, { ...r, items: replaceStep(r.items, 'e3', { kind: 'exercise', id: 'e3', exercise: { ...row, key: 'bike', name: 'Bike' }, forMode: 'seconds', forValue: 60 }) })).toBe('structure');
    expect(classifyEdit(r, { ...r, title: 'Renamed' })).toBe('structure');
    expect(classifyEdit(r, { ...r, items: [...r.items, { kind: 'rest', id: 'r9', seconds: 60 }] })).toBe('structure');
  });

  it('an unchanged workout is no edit, however its objects were built', () => {
    const r = sheet();
    expect(classifyEdit(r, structuredClone(r))).toBe('none');
    expect(classifyEdit(r, JSON.parse(JSON.stringify({ items: r.items, title: r.title, id: r.id })))).toBe('none');
  });

  it('records only what changed, by step and block id', () => {
    const r = sheet();
    const next = { ...patchStep(r, 'e2', { target: 17.5 }), items: updateBlock(patchStep(r, 'e2', { target: 17.5 }).items, 'b1', { repeat: 6 }) };
    expect(settingsChange(r, next)).toEqual({ steps: { e2: { target: 17.5 } }, blocks: { b1: { repeat: 6 } } });
  });
});

describe('your settings for a workout', () => {
  it('apply on top of the original and leave it untouched', () => {
    const r = sheet();
    const ws = withChange(undefined, { steps: { e2: { target: 17.5 }, r1: { seconds: 20 } }, blocks: { b1: { repeat: 6 } } }, T);
    const out = applySettings(r, ws);
    expect(block(out).repeat).toBe(6);
    expect(block(out).steps[1]).toMatchObject({ seconds: 20 });
    expect(block(out).steps[2]).toMatchObject({ target: 17.5, forValue: 10 });
    expect(block(r).steps[2]).toMatchObject({ target: 15 });
    expect(block(r).repeat).toBe(8);
  });

  it('a second change keeps the first', () => {
    const one = withChange(undefined, { steps: { e2: { target: 17.5 } }, blocks: {} }, T);
    const two = withChange(one, { steps: { e2: { forValue: 8 } }, blocks: {} }, '2026-09-24T08:00:00.000Z');
    expect(two.steps.e2).toEqual({ target: 17.5, forValue: 8, at: '2026-09-24T08:00:00.000Z' });
    expect(two.updatedAt).toBe('2026-09-24T08:00:00.000Z');
  });

  it('reset to original leaves an empty entry that still syncs', () => {
    const reset = cleared(T);
    expect(hasSettings(reset)).toBe(false);
    expect(applySettings(sheet(), reset)).toEqual(sheet());
    const older: WorkoutSettings = withChange(undefined, { steps: { e2: { target: 17.5 } }, blocks: {} }, '2026-09-20T08:00:00.000Z');
    expect(mergeSettings({ fran: older }, { fran: reset }).fran).toBe(reset);
  });

  it('two devices merge per workout, newest write wins', () => {
    const a = { fran: withChange(undefined, { steps: { e2: { target: 17.5 } }, blocks: {} }, '2026-09-20T08:00:00.000Z'), cindy: cleared(T) };
    const b = { fran: withChange(undefined, { steps: { e2: { target: 20 } }, blocks: {} }, '2026-09-21T08:00:00.000Z') };
    const m = mergeSettings(a, b);
    expect(m.fran.steps.e2.target).toBe(20);
    expect(m.cindy).toBe(a.cindy);
    expect(mergeSettings(b, a).fran.steps.e2.target).toBe(20);
  });

  it('never touches a percentage-of-training-max load', () => {
    const r = sheet();
    (block(r).steps[2] as { target?: unknown }).target = { pct: 80 };
    const out = applySettings(r, withChange(undefined, { steps: { e2: { target: 60 } }, blocks: {} }, T));
    expect((block(out).steps[2] as { target?: unknown }).target).toEqual({ pct: 80 });
  });
});

describe('your own version', () => {
  it('is private, points at the original and keeps the numbers you saw', () => {
    const original = sheet();
    const edited = { ...patchStep(original, 'e2', { target: 20 }), items: removeStep(patchStep(original, 'e2', { target: 20 }).items, 'e3') };
    const v = newVersion(edited, original, { id: 'u-1', creator: 'Nick' });
    expect(v).toMatchObject({ id: 'u-1', title: 'Swings & press (mine)', public: false, derivedFrom: 'fran', creator: 'Nick', source: { kind: 'user', title: 'Swings & press' } });
    expect(block(v).steps[2]).toMatchObject({ target: 20 });
    expect(v.items).toHaveLength(1);
  });

  it('keeps a name you gave it', () => {
    const original = sheet();
    expect(newVersion({ ...original, title: 'Short one' }, original, { id: 'u-2', creator: 'Nick' }).title).toBe('Short one');
  });
});
