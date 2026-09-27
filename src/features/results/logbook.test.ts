import { describe, expect, it } from 'vitest';
import type { SessionResult } from '@/features/runsheet/progression';
import { chartPoints, e1rm, exerciseHistory, isRecord, kindOf, loggedExercises, records, sessionVolume, setLabel, setsOf } from './logbook';

const session = (startedAt: string, steps: SessionResult['steps'], title = 'Push'): SessionResult => ({ id: 's-' + startedAt, runsheetId: 'w', title, startedAt, steps });

const bench = [
  session('2026-09-01T10:00:00Z', [{ stepId: 'a', exerciseKey: 'bench', sets: [{ load: 60, reps: 8 }, { load: 60, reps: 8 }] }]),
  session('2026-09-08T10:00:00Z', [{ stepId: 'a', exerciseKey: 'bench', sets: [{ load: 65, reps: 5 }, { load: 60, reps: 10 }] }]),
  // An older result with no per-set rows.
  session('2026-08-25T10:00:00Z', [{ stepId: 'a', exerciseKey: 'bench', target: 55, reps: [8, 8, 6] }]),
];

describe('the logbook', () => {
  it('reads older results from target and reps', () => {
    expect(setsOf({ stepId: 'a', exerciseKey: 'x', target: 55, reps: [8, 6] })).toEqual([{ load: 55, reps: 8 }, { load: 55, reps: 6 }]);
    expect(setsOf({ stepId: 'a', exerciseKey: 'x', target: 14.5 })).toEqual([{ load: 14.5 }]);
    expect(setsOf({ stepId: 'a', exerciseKey: 'x' })).toEqual([]);
  });

  it('estimates a 1RM by Epley, and a single is itself', () => {
    expect(e1rm({ load: 100, reps: 1 })).toBe(100);
    expect(e1rm({ load: 100, reps: 5 })).toBeCloseTo(116.67, 1);
    expect(e1rm({ load: 100 })).toBeUndefined();
    expect(e1rm({ reps: 10 })).toBeUndefined();
    expect(e1rm({ load: 100, reps: 10 })).toBeCloseTo(133.33, 1);
    expect(e1rm({ load: 100, reps: 11 })).toBeUndefined(); // Epley overstates past 10
  });

  it('a set above 10 reps counts for most reps and volume, not the 1RM', () => {
    const r = records([session('2026-09-01T10:00:00Z', [{ stepId: 'a', exerciseKey: 'bench', sets: [{ load: 60, reps: 5 }, { load: 40, reps: 15 }] }])], 'bench');
    expect(r.e1rm?.value).toBe(70);
    expect(r.reps).toMatchObject({ value: 15 });
    expect(r.volume?.value).toBe(900);
  });

  it('charts top load for a session with only sets above 10 reps', () => {
    const h = exerciseHistory([session('2026-09-01T10:00:00Z', [{ stepId: 'a', exerciseKey: 'bench', sets: [{ load: 60, reps: 5 }] }]), session('2026-09-02T10:00:00Z', [{ stepId: 'a', exerciseKey: 'bench', sets: [{ load: 40, reps: 15 }, { load: 45, reps: 12 }] }])], 'bench');
    expect(chartPoints(h).map(p => p.value)).toEqual([70, 45]);
  });

  it('lists sessions newest first, with title and sets', () => {
    const h = exerciseHistory(bench, 'bench');
    expect(h.map(s => s.startedAt.slice(0, 10))).toEqual(['2026-09-08', '2026-09-01', '2026-08-25']);
    expect(h[0]).toMatchObject({ title: 'Push', sets: [{ load: 65, reps: 5 }, { load: 60, reps: 10 }] });
  });

  it('joins every row of the exercise in a session, and follows a swap by exercise key', () => {
    const r = [
      session('2026-09-10T10:00:00Z', [
        { stepId: 'row', exerciseKey: 'rower', sets: [{}, {}] },
        // Swapped to the bike for the last rounds of the same step.
        { stepId: 'row', exerciseKey: 'bike', sets: [{}] },
        { stepId: 'row2', exerciseKey: 'rower', sets: [{}] },
      ]),
    ];
    expect(exerciseHistory(r, 'rower')[0].sets).toHaveLength(3);
    expect(exerciseHistory(r, 'bike')[0].sets).toHaveLength(1);
  });

  it('picks what to chart from what was logged', () => {
    expect(kindOf([{ sets: [{ load: 60, reps: 8 }] }])).toBe('strength');
    expect(kindOf([{ sets: [{ load: 14.5 }] }])).toBe('load');
    expect(kindOf([{ sets: [{ reps: 12 }] }])).toBe('reps');
    expect(kindOf([{ sets: [{}, {}] }])).toBe('rounds');
  });

  it('charts the best set per session, oldest first', () => {
    const pts = chartPoints(exerciseHistory(bench, 'bench'));
    expect(pts.map(p => p.at.slice(0, 10))).toEqual(['2026-08-25', '2026-09-01', '2026-09-08']);
    expect(pts[2].value).toBeCloseTo(80, 5); // 60 × 10 beats 65 × 5 on Epley
  });

  it('keeps each record with the date it was set', () => {
    const r = records(bench, 'bench');
    expect(r.kind).toBe('strength');
    expect(r.sessions).toBe(3);
    expect(r.heaviest).toMatchObject({ value: 65, at: '2026-09-08T10:00:00Z' });
    expect(r.e1rm?.value).toBeCloseTo(80, 5);
    expect(r.reps).toMatchObject({ value: 10, at: '2026-09-08T10:00:00Z' });
    expect(r.volume).toMatchObject({ value: 1210, at: '2026-08-25T10:00:00Z' }); // 55 × (8 + 8 + 6)
  });

  it('a tie does not move a record to the later date', () => {
    const r = records([session('2026-09-01T10:00:00Z', [{ stepId: 'a', exerciseKey: 'bench', sets: [{ load: 60, reps: 8 }] }]), session('2026-09-02T10:00:00Z', [{ stepId: 'a', exerciseKey: 'bench', sets: [{ load: 60, reps: 8 }] }])], 'bench');
    expect(r.heaviest?.at).toBe('2026-09-01T10:00:00Z');
  });

  it('shows what exists for timed work: top speed and sessions', () => {
    const r = records([session('2026-09-01T10:00:00Z', [{ stepId: 's', exerciseKey: 'sprint', target: 14.5, sets: [{ load: 14 }, { load: 14.5 }] }]), session('2026-09-03T10:00:00Z', [{ stepId: 's', exerciseKey: 'sprint', sets: [{ load: 15 }] }])], 'sprint');
    expect(r).toMatchObject({ kind: 'load', sessions: 2, heaviest: { value: 15 } });
    expect(r.e1rm).toBeUndefined();
    expect(r.volume).toBeUndefined();
  });

  it('marks a set that beat a record standing before it, never in the first session', () => {
    const h = exerciseHistory(bench, 'bench');
    expect(h[2].prs).toEqual([false, false, false]); // first session
    expect(h[1].prs).toEqual([true, false]); // 60 heavier than 55; the second 60 × 8 only ties
    expect(h[0].prs).toEqual([true, true]); // 65 heaviest; 60 × 10 best e1RM and most reps
  });

  it('isRecord needs a record to beat', () => {
    expect(isRecord({ load: 100, reps: 5 }, { kind: 'strength', sessions: 0 })).toBe(false);
    const before = records(bench, 'bench');
    expect(isRecord({ load: 70, reps: 1 }, before)).toBe(true);
    expect(isRecord({ load: 60, reps: 8 }, before)).toBe(false);
    expect(isRecord({ reps: 11 }, before)).toBe(true);
  });

  it('more reps is a PR only without a load', () => {
    const before = records(bench, 'bench'); // most reps 10, heaviest 65, e1RM 80
    expect(isRecord({ load: 20, reps: 15 }, before)).toBe(false);
    expect(isRecord({ reps: 12 }, before)).toBe(true);
    expect(isRecord({ reps: 10 }, before)).toBe(false); // a tie
  });

  it('volume sums load × reps', () => {
    expect(sessionVolume({ sets: [{ load: 60, reps: 8 }, { load: 50, reps: 10 }, { reps: 5 }] })).toBe(980);
    expect(sessionVolume({ sets: [{ load: 14 }] })).toBeUndefined();
  });

  it('lists every logged exercise, most recently done first', () => {
    const list = loggedExercises([...bench, session('2026-09-09T10:00:00Z', [{ stepId: 'x', exerciseKey: 'squat', sets: [{ load: 80, reps: 5 }] }])]);
    expect(list).toEqual([
      { exerciseKey: 'squat', lastAt: '2026-09-09T10:00:00Z', sessions: 1 },
      { exerciseKey: 'bench', lastAt: '2026-09-08T10:00:00Z', sessions: 3 },
    ]);
  });

  it('labels a set', () => {
    expect(setLabel({ load: 57.5, reps: 8 })).toBe('57.5 × 8');
    expect(setLabel({ load: 14.5 }, 'kph')).toBe('14.5 kph');
    expect(setLabel({ reps: 12 })).toBe('12 reps');
    expect(setLabel({})).toBe('');
  });
});
