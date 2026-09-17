import { describe, expect, it } from 'vitest';
import { effort, loadTrend, streak, workedFrom } from './effort';
import { muscleLoad, musclesFor } from './muscles';
import type { SessionResult } from '@/features/runsheet/progression';

const res = (startedAt: string): SessionResult => ({ id: 's' + startedAt, runsheetId: 'u-1', startedAt, steps: [] });

describe('muscles', () => {
  it('reads the specific word, not the generic one', () => {
    expect(musclesFor('Incline chest press')).toMatchObject({ chest: 1 });
    expect(musclesFor('Shoulder press')).toMatchObject({ shoulders: 1 });
    expect(musclesFor('Kettlebell swings')).toMatchObject({ glutes: 1, hamstrings: 1 });
    expect(musclesFor('Lateral raises')).toMatchObject({ shoulders: 1 });
  });

  it('falls back to the equipment when the name says nothing', () => {
    expect(musclesFor('Some machine thing', 'rower')).toMatchObject({ back: 1 });
    expect(musclesFor('Some machine thing')).toEqual({});
  });

  it('normalises so the hardest-worked muscle is 1', () => {
    const load = muscleLoad([
      { name: 'Kettlebell swings', seconds: 240 },
      { name: 'Lateral raises', seconds: 60 },
    ]);
    expect(load.glutes).toBe(1);
    expect(load.shoulders).toBeLessThan(1);
    expect(load.shoulders).toBeGreaterThan(0);
  });
});

describe('effort', () => {
  it('counts work time, sets and tonnage', () => {
    const e = effort(res('2026-09-15T17:00:00Z'), [
      { group: 'kettlebell', seconds: 30, reps: 15, load: 28 },
      { group: 'dumbbell', seconds: 30, reps: 10, load: 20 },
    ], 80);
    expect(e.workSec).toBe(60);
    expect(e.sets).toBe(2);
    expect(e.tonnage).toBe(15 * 28 + 10 * 20);
    expect(e.kcal).toBeGreaterThan(0);
    expect(e.estimatedWeight).toBe(false);
  });

  it('says when bodyweight was a guess', () => {
    expect(effort(res('2026-09-15T17:00:00Z'), [{ group: 'walk', seconds: 600, reps: 0 }]).estimatedWeight).toBe(true);
  });
});

describe('streak', () => {
  const monday = new Date('2026-09-14T09:00:00Z');
  it('counts consecutive weeks back from this one', () => {
    const s = streak([res('2026-09-15T17:00:00Z'), res('2026-09-16T17:00:00Z'), res('2026-09-09T17:00:00Z')], monday);
    expect(s.thisWeek).toBe(2);
    expect(s.lastWeek).toBe(1);
    expect(s.weeks).toBe(2);
  });

  it('is zero weeks when this week is empty', () => {
    expect(streak([res('2026-09-01T17:00:00Z')], monday).weeks).toBe(0);
  });
});

describe('load trend', () => {
  it('reads one load per session, oldest first', () => {
    const a = { ...res('2026-09-01T10:00:00Z'), steps: [{ stepId: 'e', exerciseKey: 'press', target: 15 }] };
    const b = { ...res('2026-09-10T10:00:00Z'), steps: [{ stepId: 'e', exerciseKey: 'press', target: 20 }] };
    expect(loadTrend([b, a], 'press').map(x => x.load)).toEqual([15, 20]);
  });
});

describe('sets from a logged session', () => {
  const sheet = {
    id: 'u-1',
    title: 'T',
    items: [{ kind: 'block' as const, id: 'b', name: 'B', repeat: 8, steps: [{ kind: 'exercise' as const, id: 'e1', exercise: { key: 'kb_swing', name: 'Kettlebell swings', unit: 'kg', step: 4 }, target: 28, forMode: 'seconds' as const, forValue: 30 }] }],
  };
  const ex = (k: string) => ({ name: k, group: 'kettlebell' as const });

  it('expands a block into one entry per round, with the load used', () => {
    const w = workedFrom({ ...res('2026-09-15T17:00:00Z'), steps: [{ stepId: 'e1', exerciseKey: 'kb_swing', target: 32 }] }, sheet, ex);
    expect(w).toHaveLength(8);
    expect(w[0]).toMatchObject({ seconds: 30, load: 32 });
  });

  it('still produces a set without the runsheet', () => {
    const w = workedFrom({ ...res('2026-09-15T17:00:00Z'), durationSec: 600, steps: [{ stepId: 'gone', exerciseKey: 'kb_swing', target: 28 }] }, undefined, ex);
    expect(w).toHaveLength(1);
    expect(w[0].seconds).toBeGreaterThan(0);
  });
});
