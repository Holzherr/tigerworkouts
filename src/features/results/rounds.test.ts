import { describe, expect, it } from 'vitest';
import type { SessionResult } from '@/features/runsheet/progression';
import { fastestRounds, roundPRs, roundRows, roundTimes } from './rounds';

const s = (startedAt: string, at: number[], from?: number, runsheetId = 'w'): SessionResult => ({ id: startedAt, runsheetId, startedAt, steps: [], splits: [{ blockId: 'b', at, ...(from !== undefined ? { from } : {}) }] });

describe('round times', () => {
  it('each round from the one before, round 1 from the block start', () => {
    expect(roundTimes({ blockId: 'b', at: [100, 190, 290], from: 5 })).toEqual([95, 90, 100]);
    expect(roundTimes({ blockId: 'b', at: [100, 190] })).toEqual([undefined, 90]); // kept before `from` was
    // With round starts kept, the rest before a round is not in its time.
    expect(roundTimes({ blockId: 'b', at: [100, 190, 290], from: 5, starts: [5, 130, 220] })).toEqual([95, 60, 70]);
  });
  it('marks the fastest and slowest, and compares each round with last time', () => {
    const [row] = roundRows(s('2026-09-08', [100, 190, 290], 5), s('2026-09-01', [105, 200, 290], 5));
    expect(row).toEqual({ blockId: 'b', times: [95, 90, 100], fastest: 1, slowest: 2, vsLast: [-5, -5, 10] });
    expect(roundRows(s('2026-09-08', [100], 5))[0].fastest).toBeUndefined();
  });
  it('the fastest round of a workout, and a PR only against a standing one', () => {
    const past = [s('2026-09-01', [100, 190], 5), s('2026-09-05', [98, 200], 10), s('2026-09-06', [50], 0, 'other')];
    expect(fastestRounds(past)).toEqual([{ blockId: 'b', round: 0, seconds: 50, at: '2026-09-06' }]);
    const today = s('2026-09-08', [90, 174], 5);
    expect(roundPRs(today, [...past, today])).toEqual([{ blockId: 'b', round: 1, seconds: 84, at: '2026-09-08', was: 88 }]);
    expect(roundPRs(past[0], past)).toEqual([]);
  });
});
