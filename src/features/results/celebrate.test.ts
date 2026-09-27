import { describe, expect, it } from 'vitest';
import type { SessionResult } from '@/features/runsheet/progression';
import { celebrate, deltaLines, effortWord, streakLabel, totalVolume } from './celebrate';
import { sessionPRs } from './logbook';

const s = (id: string, startedAt: string, steps: SessionResult['steps'], extra: Partial<SessionResult> = {}): SessionResult => ({ id, runsheetId: 'push', title: 'Push', startedAt, steps, ...extra });
const bench = (...sets: [number, number][]) => ({ stepId: 'b', exerciseKey: 'bench', sets: sets.map(([load, reps]) => ({ load, reps })) });
const pushups = (...reps: number[]) => ({ stepId: 'p', exerciseKey: 'pushup', sets: reps.map(r => ({ reps: r })) });

const past = [
  s('s1', '2026-09-01T10:00:00Z', [bench([60, 8], [60, 8]), pushups(15)], { score: 600, durationSec: 1800 }),
  s('s2', '2026-09-08T10:00:00Z', [bench([62.5, 8], [62.5, 6]), pushups(18)], { score: 580, durationSec: 1700 }),
  s('other', '2026-09-10T10:00:00Z', [], { runsheetId: 'run', title: 'Run' }),
];
const today = s('s3', '2026-09-15T10:00:00Z', [bench([65, 5], [67.5, 3]), pushups(17)], { score: 560, durationSec: 1760 });

describe('sessionPRs', () => {
  it('lists one record per exercise, the best set that beat what stood before', () => {
    expect(sessionPRs(today, [...past, today])).toEqual([{ exerciseKey: 'bench', set: { load: 65, reps: 5 } }]);
  });
  it('is empty the first time an exercise is done', () => {
    expect(sessionPRs(past[0], past)).toEqual([]);
  });
  it('ignores sessions after this one, so an old session keeps its PRs', () => {
    const later = s('s4', '2026-09-20T10:00:00Z', [bench([80, 5])]);
    expect(sessionPRs(past[1], [...past, later]).map(p => p.exerciseKey)).toEqual(['bench', 'pushup']);
  });
  it('works whether or not the session is already in the list', () => {
    expect(sessionPRs(today, past)).toEqual(sessionPRs(today, [...past, today]));
  });
});

describe('celebrate', () => {
  it('counts every session logged before it, this one included', () => {
    expect(celebrate(today, [...past, today]).ordinal).toBe(4);
    expect(celebrate(today, past).ordinal).toBe(4);
    expect(celebrate(past[0], past).ordinal).toBe(1);
  });
  it('compares with the last time of the same workout only', () => {
    const c = celebrate(today, [...past, today]);
    expect(c.last?.id).toBe('s2');
    expect(c.deltas).toEqual({ score: -20, durationSec: 60, volume: 65 * 5 + 67.5 * 3 - (62.5 * 8 + 62.5 * 6) });
  });
  it('has no deltas the first time', () => {
    const c = celebrate(past[0], past);
    expect(c.last).toBeUndefined();
    expect(c.deltas).toEqual({});
  });
  it('carries the streak as of the session', () => {
    expect(celebrate(today, [...past, today]).streak).toMatchObject({ weeks: 3, thisWeek: 1, total: 4 });
  });
  it('sums volume across exercises and skips unloaded work', () => {
    expect(totalVolume(today)).toBe(65 * 5 + 67.5 * 3);
    expect(totalVolume(s('x', '2026-09-01T00:00:00Z', [pushups(20)]))).toBeUndefined();
  });
});

describe('deltaLines', () => {
  const c = celebrate(today, [...past, today]);
  it('a lower time is faster and better', () => {
    expect(deltaLines(c, 'time')[0]).toEqual({ label: 'Score', text: '0:20 faster', better: true });
  });
  it('a lower rep score is worse', () => {
    expect(deltaLines(c, 'reps')[0]).toEqual({ label: 'Score', text: '−20 reps', better: false });
  });
  it('volume, then duration with no verdict', () => {
    expect(deltaLines(c, 'none')).toEqual([
      { label: 'Volume', text: '−348 kg', better: false },
      { label: 'Time', text: '1 min longer' },
    ]);
  });
});

describe('short sessions', () => {
  it('say seconds under a minute', () => {
    const a = s('a', '2026-09-01T10:00:00Z', [], { durationSec: 37 });
    const b = s('b', '2026-09-02T10:00:00Z', [], { durationSec: 6 });
    expect(deltaLines(celebrate(b, [a, b]), 'none')).toEqual([{ label: 'Time', text: '31s shorter' }]);
  });
});

describe('labels', () => {
  it('words the effort scale the way Health does', () => {
    expect([1, 3, 4, 6, 7, 8, 9, 10].map(effortWord)).toEqual(['Easy', 'Easy', 'Moderate', 'Moderate', 'Hard', 'Hard', 'All out', 'All out']);
  });
  it('leaves out a one-week streak', () => {
    expect(streakLabel({ weeks: 1, thisWeek: 2, lastWeek: 0, total: 5 })).toBe('2 this week');
    expect(streakLabel({ weeks: 3, thisWeek: 1, lastWeek: 2, total: 9 })).toBe('3 weeks running · 1 this week');
  });
});
