import { describe, expect, it } from 'vitest';
import type { SessionResult } from '@/features/runsheet/progression';
import { chartMetrics, chartPoints, e1rm, exerciseHistory, inRange, isRecord, kindOf, loggedExercises, METRIC_LABEL, pointsFor, RANGE_LABEL, records, sessionVolume, setLabel, setsOf } from './logbook';

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

describe('timed and distance work in the logbook', () => {
  const rows = [
    session('2026-09-01T10:00:00Z', [{ stepId: 'r', exerciseKey: 'row', sets: [{ meters: 500, seconds: 110 }, { meters: 500, seconds: 106 }] }]),
    session('2026-09-08T10:00:00Z', [{ stepId: 'r', exerciseKey: 'row', sets: [{ meters: 500, seconds: 104 }, { meters: 1000, seconds: 230 }] }]),
    session('2026-09-15T10:00:00Z', [{ stepId: 'r', exerciseKey: 'row', sets: [{ meters: 500, seconds: 105 }, { meters: 1200 }] }]),
  ];
  const planks = [
    session('2026-09-01T10:00:00Z', [{ stepId: 'p', exerciseKey: 'plank', sets: [{ seconds: 60 }, { seconds: 45 }] }]),
    session('2026-09-03T10:00:00Z', [{ stepId: 'p', exerciseKey: 'plank', sets: [{ seconds: 75, type: 'warmup' }, { seconds: 62 }] }]),
  ];
  it('tells timed, distance and calorie work apart', () => {
    expect(kindOf([{ sets: [{ meters: 500, seconds: 100 }] }])).toBe('pace');
    expect(kindOf([{ sets: [{ meters: 500 }] }])).toBe('distance');
    expect(kindOf([{ sets: [{ calories: 20, seconds: 40 }] }])).toBe('calories');
    expect(kindOf([{ sets: [{ seconds: 60 }] }])).toBe('time');
    expect(kindOf([{ sets: [{ load: 24, seconds: 40 }] }])).toBe('load'); // a carry: the weight leads
  });
  it('keeps the fastest time per distance, the furthest and the longest hold', () => {
    const r = records(rows, 'row');
    expect(r.kind).toBe('pace');
    expect(r.fastest?.['500']).toMatchObject({ value: 104, at: '2026-09-08T10:00:00Z' });
    expect(r.fastest?.['1000']?.value).toBe(230);
    expect(r.distance?.value).toBe(1200);
    const p = records(planks, 'plank');
    expect(p.longest).toMatchObject({ value: 62, at: '2026-09-03T10:00:00Z' }); // the warm-up is not a record
  });
  it('charts the best pace per session, and the longest hold', () => {
    expect(chartPoints(exerciseHistory(rows, 'row'), 'pace', 500).map(p => p.value)).toEqual([106, 104, 105]);
    expect(chartPoints(exerciseHistory(planks, 'plank')).map(p => p.value)).toEqual([60, 62]);
  });
  it('marks a faster time over the same distance, further, more calories, a longer hold', () => {
    const h = exerciseHistory(rows, 'row').reverse();
    expect(h.map(s => s.prs)).toEqual([[false, false], [true, true], [false, true]]) // never in the first session;
    expect(exerciseHistory(planks, 'plank')[0].prs).toEqual([false, true]);
    const cal = records([session('2026-09-01T10:00:00Z', [{ stepId: 'b', exerciseKey: 'bike', sets: [{ calories: 20 }] }])], 'bike');
    expect(isRecord({ calories: 21 }, cal)).toBe(true);
    expect(isRecord({ calories: 20 }, cal)).toBe(false);
  });
  it('labels a set by what it measured', () => {
    expect(setLabel({ meters: 500, seconds: 101 })).toBe('500 m in 1:41');
    expect(setLabel({ calories: 20 })).toBe('20 cal');
    expect(setLabel({ seconds: 45 })).toBe('45 s');
    expect(setLabel({ load: 24, seconds: 40 }, 'kg')).toBe('24 kg · 40 s');
  });
});

describe('rows logged before measures had their own fields', () => {
  // Before 28 Sep a rower, a plank or a bike logged its metres, seconds or calories as the load.
  const old = [
    session('2026-09-01T10:00:00Z', [{ stepId: 'r', exerciseKey: 'row', target: 500, sets: [{ load: 500, at: 120 }] }]),
    session('2026-09-03T10:00:00Z', [{ stepId: 'p', exerciseKey: 'plank', target: 60 }]),
    session('2026-09-29T10:00:00Z', [{ stepId: 'r', exerciseKey: 'row', sets: [{ meters: 1000, seconds: 230 }] }]),
  ];
  it('read the load as the measure of an exercise counted in m, s or cal', () => {
    expect(setsOf(old[0].steps[0], 'm')).toEqual([{ meters: 500, at: 120 }]);
    expect(setsOf(old[1].steps[0], 's')).toEqual([{ seconds: 60 }]);
    expect(setsOf({ stepId: 'b', exerciseKey: 'bike', reps: [1], target: 20 }, 'cal')).toEqual([{ reps: 1, calories: 20 }]);
    expect(setsOf(old[0].steps[0], 'kg')).toEqual([{ load: 500, at: 120 }]);
    // A set that has its measure keeps both as they are.
    expect(setsOf({ stepId: 'r', exerciseKey: 'row', sets: [{ load: 3, meters: 500 }] }, 'm')).toEqual([{ load: 3, meters: 500 }]);
  });
  it('the logbook charts and ranks them by distance, not as a load', () => {
    const h = exerciseHistory(old, 'row', 'm');
    expect(kindOf(h)).toBe('pace');
    expect(h.map(s => s.sets)).toEqual([[{ meters: 1000, seconds: 230 }], [{ meters: 500, at: 120 }]]);
    expect(records(old, 'row', 'm')).toMatchObject({ kind: 'pace', distance: { value: 1000 } });
    expect(records(old, 'row', 'm').heaviest).toBeUndefined();
    expect(records(old, 'plank', 's')).toMatchObject({ kind: 'time', longest: { value: 60 } });
  });
});

describe('chart metrics and ranges', () => {
  const s = (startedAt: string, sets: { load?: number; reps?: number; type?: 'warmup' }[]) => ({ runsheetId: 'w', title: 'W', startedAt, sets, prs: [] });
  it('offers more than one metric only where they differ', () => {
    expect(chartMetrics('strength')).toEqual(['strength', 'load', 'volume', 'reps']);
    expect(chartMetrics('reps')).toEqual(['reps', 'totalReps']);
    expect(chartMetrics('pace')).toEqual(['pace', 'distance']);
    expect(chartMetrics('time')).toEqual(['time']);
    expect(METRIC_LABEL.strength).toBe('Est. 1RM');
  });
  it('volume and total reps leave warm-ups out', () => {
    const h = [s('2026-09-01T10:00:00Z', [{ load: 40, reps: 10, type: 'warmup' }, { load: 60, reps: 8 }, { load: 60, reps: 6 }])];
    expect(pointsFor(h, 'volume')).toEqual([{ at: '2026-09-01T10:00:00Z', value: 840 }]);
    expect(pointsFor(h, 'totalReps')).toEqual([{ at: '2026-09-01T10:00:00Z', value: 14 }]);
    expect(pointsFor(h, 'load')[0].value).toBe(60);
  });
  it('a range keeps the points from the last 90 or 365 days', () => {
    const now = Date.parse('2026-09-28T12:00:00Z');
    const pts = ['2025-01-01', '2026-01-01', '2026-08-01', '2026-09-27'].map(d => ({ at: `${d}T10:00:00Z`, value: 1 }));
    expect(inRange(pts, '3m', now).map(p => p.at.slice(0, 10))).toEqual(['2026-08-01', '2026-09-27']);
    expect(inRange(pts, '1y', now)).toHaveLength(3);
    expect(inRange(pts, 'all', now)).toHaveLength(4);
    expect(RANGE_LABEL).toEqual({ '3m': '3 m', '1y': '1 y', all: 'All' });
  });
});
