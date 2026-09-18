import { describe, expect, it } from 'vitest';
import { fromLegacySession, legacyWorkoutToRunsheet } from './legacy';
import { fromRow, toRow } from './sync';

const legacy = {
  id: 's-mtn8vr5s7i1z',
  workoutId: 'priyanka-swings-incline-press-sprints',
  title: 'Swings, incline press & sprints',
  creator: 'Priyanka',
  startedAt: '2026-09-04T17:20:00.000Z',
  endedAt: '2026-09-04T18:00:00.000Z',
  duration_min: 40,
  completed: true,
  notes: 'All four blocks done.',
  blocks: [
    { name: 'Swings + incline press', type: 'interval' as const, rounds: 8, exercises: [{ ex: 'kb_swing', target: 28, actual: 28, actuals: [28] }, { ex: 'db_incline_press', target: 15, actual: 20, actuals: [20] }] },
    { name: 'Incline walk', type: 'steady' as const, ex: 'incline_walk', speeds_actual: [10, 6], minutes_done: 10 },
  ],
};

describe('legacy sessions', () => {
  it('converts a v0.9 session and keeps the original', () => {
    const r = fromLegacySession(legacy);
    expect(r.id).toBe('s-mtn8vr5s7i1z');
    expect(r.durationSec).toBe(2400);
    expect(r.steps.find(s => s.exerciseKey === 'db_incline_press')?.target).toBe(20);
    expect(r.steps.find(s => s.exerciseKey === 'incline_walk')?.target).toBe(10);
    expect(r.legacy).toBe(legacy);
  });
  it('pushes a legacy row back in its own shape with edits applied', () => {
    const r = { ...fromLegacySession(legacy), notes: 'edited' };
    const row = toRow(r, 'u');
    expect(row.type).toBe('workout');
    expect((row.data as { blocks: unknown[] }).blocks).toHaveLength(2);
    expect((row.data as { notes: string }).notes).toBe('edited');
    const back = fromRow({ id: row.id, data: row.data });
    expect(back.notes).toBe('edited');
    expect(back.legacy).toBeTruthy();
  });
  it('round-trips a v2 result with an empty blocks[] for the old app', () => {
    const r = { id: 's-x', runsheetId: 'cf-girls-fran', title: 'Fran', startedAt: '2026-09-06T10:00:00.000Z', score: 402, durationSec: 402, steps: [{ stepId: 't', exerciseKey: 'bb_thruster', target: 43, reps: [21, 15, 9] }] };
    const row = toRow(r, 'u');
    expect(row.type).toBe('v2');
    expect((row.data as { blocks: unknown[] }).blocks).toEqual([]);
    expect(fromRow({ id: row.id, data: row.data })).toEqual(r);
  });
  it('converts a v0.9 workout to a runsheet', () => {
    const r = legacyWorkoutToRunsheet({ id: 'u-1', title: 'Mine', creator: 'Nick', blocks: [{ type: 'interval', name: 'B', work_s: 30, rest_s: 30, rounds: 4, exercises: [{ ex: 'kb_swing', target: 24 }] }] });
    expect(r.items[0].kind).toBe('block');
    expect(r.source?.kind).toBe('user');
  });
});
