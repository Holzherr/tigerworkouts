import { describe, expect, it } from 'vitest';
import type { Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import { fmtMinutes, nextUp, totalMinutes } from './next-up';

const w = (id: string, program?: Runsheet['program']): Runsheet => ({ id, title: id, items: [], program });
const did = (runsheetId: string, day: number, durationSec?: number): SessionResult => ({ runsheetId, startedAt: `2026-09-${String(day).padStart(2, '0')}T10:00:00Z`, steps: [], durationSec });

describe('nextUp', () => {
  const all = [w('a', { name: 'P', day: 'A', order: 1 }), w('b', { name: 'P', day: 'B', order: 2 }), w('fran')];
  it('is nothing without history', () => {
    expect(nextUp(all, [])).toBeUndefined();
  });
  it('offers the next day of the program the last session was in', () => {
    const n = nextUp(all, [did('a', 20)]);
    expect(n?.runsheet.id).toBe('b');
    expect(n?.reason).toBe('Next in P');
  });
  it('wraps round to day one after the last day', () => {
    expect(nextUp(all, [did('b', 20)])?.runsheet.id).toBe('a');
  });
  it('offers the last workout again when it is not in a program', () => {
    const n = nextUp(all, [did('a', 18), did('fran', 20)]);
    expect(n?.runsheet.id).toBe('fran');
    expect(n?.reason).toBe('Your last workout');
  });
  it('goes by date, not list order, and skips sessions whose workout is gone', () => {
    expect(nextUp(all, [did('fran', 10), did('gone', 25), did('a', 20)])?.runsheet.id).toBe('b');
  });
});

describe('totalMinutes', () => {
  it('adds timed sessions and quick logs', () => {
    expect(totalMinutes([did('a', 1, 1800), { ...did('b', 2), activity: { name: 'Run', minutes: 25 } }])).toBe(55);
  });
  it('formats hours', () => {
    expect(fmtMinutes(45)).toBe('45 min');
    expect(fmtMinutes(200)).toBe('3 h 20');
    expect(fmtMinutes(120)).toBe('2 h');
  });
});
