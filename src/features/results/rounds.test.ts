import { describe, expect, it } from 'vitest';
import { EX } from '@/features/runsheet/fixtures';
import { makeExercise, makeRest, type Block, type Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import { amountRows, fastestRounds, fixedTime, roundPRs, roundRows, roundTimes } from './rounds';

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

const block = (id: string, steps: Block['steps'], extra: Partial<Block> = {}): Block => ({ kind: 'block', id, name: id, repeat: 3, steps, ...extra });
const ex = (id: string, e: (typeof EX)[string], o: Parameters<typeof makeExercise>[1], log?: 'reps' | 'meters' | 'calories') => ({ ...makeExercise(e, o), ...(log ? { log } : {}), id });
// Nick's "Rows, lunges, rower sprints & abs": a timed rower, chest-supported rows, all-timed abs.
const sheet = (): Runsheet => ({
  id: 'w',
  title: 'W',
  items: [
    block('rows', [ex('cs', EX.db_row, { forMode: 'reps', forValue: 10, target: 20 }), ex('sw', EX.kb_swing, { forMode: 'reps', forValue: 15, target: 24 })]),
    block('sprints', [ex('rw', EX.cardio_rower, { forMode: 'seconds', forValue: 30 }, 'meters'), { ...makeRest(30), id: 'r' }]),
    block('abs', [ex('pl', EX.bw_plank, { forMode: 'seconds', forValue: 30 }), ex('sw2', EX.kb_swing, { forMode: 'seconds', forValue: 30, target: 16 })]),
  ],
});
const session = (splits: SessionResult['splits'], steps: SessionResult['steps'] = []): SessionResult => ({ runsheetId: 'w', startedAt: '2026-10-18', steps, splits });

describe('round times only when they say something', () => {
  it('a block is fixed-time when every exercise in it runs on the clock', () => {
    const [rows, sprints, abs] = sheet().items as Block[];
    expect([rows, sprints, abs].map(fixedTime)).toEqual([false, true, true]);
    expect(fixedTime({ ...abs, mode: 'emom' })).toBe(true);
    expect(fixedTime({ ...abs, mode: 'fortime' })).toBe(false);
    expect(fixedTime({ ...abs, mode: 'amrap' })).toBe(false);
  });
  it('an all-timed workout has no round times', () => {
    const r = session([{ blockId: 'abs', at: [121, 241, 362], starts: [0, 121, 241] }]);
    expect(roundRows(r, undefined, sheet())).toEqual([]);
    // Without the workout, as before: every split, but 2:01 against 2:00 earns no badge.
    const [row] = roundRows(r);
    expect(row.times).toEqual([121, 120, 121]);
    expect(row.fastest).toBeUndefined();
    expect(row.slowest).toBeUndefined();
    expect(roundPRs(r, [session([{ blockId: 'abs', at: [130], starts: [0] }]), r], sheet())).toEqual([]);
  });
  it('a rep-based for-time workout badges rounds really apart', () => {
    const r = session([{ blockId: 'rows', at: [95, 205, 290], starts: [0, 100, 210] }]);
    const [row] = roundRows(r, undefined, sheet());
    expect(row).toMatchObject({ times: [95, 105, 80], fastest: 2, slowest: 1 });
    // 4 s apart on 80 is under the 5 s floor; 6 s apart on 200 is under 5%.
    expect(roundRows(session([{ blockId: 'rows', at: [80, 164], starts: [0, 80] }]))[0].fastest).toBeUndefined();
    expect(roundRows(session([{ blockId: 'rows', at: [200, 406], starts: [0, 200] }]))[0].fastest).toBeUndefined();
  });
  it('a mixed workout: round times for the rep block, metres per round for the sprints, nothing for abs', () => {
    const r = session(
      [
        { blockId: 'rows', at: [95, 205, 290], starts: [0, 100, 210] },
        { blockId: 'abs', at: [600, 720, 841], starts: [480, 600, 720] },
      ],
      [{ stepId: 'rw', exerciseKey: 'cardio_rower', sets: [{ meters: 142, seconds: 30 }, { meters: 138, seconds: 30 }, { meters: 145, seconds: 30 }] }]
    );
    expect(roundRows(r, undefined, sheet()).map(x => x.blockId)).toEqual(['rows']);
    expect(amountRows(r, sheet())).toEqual([{ blockId: 'sprints', stepId: 'rw', exerciseKey: 'cardio_rower', field: 'meters', values: [142, 138, 145], best: 2 }]);
  });
  it('logged amounts: any difference is a best, none when all match or under two rounds', () => {
    const steps = (meters: (number | undefined)[]) => [{ stepId: 'rw', exerciseKey: 'cardio_rower', sets: meters.map(m => ({ ...(m !== undefined ? { meters: m } : {}), seconds: 30 })) }];
    expect(amountRows(session([], steps([140, 141])), sheet())[0].best).toBe(1);
    expect(amountRows(session([], steps([140, 140])), sheet())[0].best).toBeUndefined();
    expect(amountRows(session([], steps([140, undefined])), sheet())).toEqual([]);
    expect(amountRows(session([], steps([140, 141])))).toEqual([]); // no workout, no way to tell
  });
});
