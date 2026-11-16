import { describe, expect, it } from 'vitest';
import type { Runsheet } from '@/features/runsheet/model';
import type { SessionResult, SetResult } from '@/features/runsheet/progression';
import { weekDelta, weekFamily, weekTable } from './week-table';

// Ported from ios/TigerWorkoutsTests/WeekTableTests.swift.
const hip = { key: 'bb_hip_thrust', name: 'Hip thrust', unit: 'kg', step: 2.5 };
const press = { key: 'db_shoulder_press', name: 'Shoulder press', unit: 'kg per arm', step: 2.5 };

const sheet = (id: string, more: Partial<Runsheet> = {}): Runsheet => ({
  id,
  title: id,
  items: [
    {
      kind: 'block',
      id: 'b1',
      name: 'Main',
      repeat: 3,
      steps: [
        { kind: 'exercise', id: 's1', exercise: hip, target: 100, forMode: 'reps', forValue: 8 },
        { kind: 'exercise', id: 's2', exercise: press, target: 12.5, forMode: 'reps', forValue: 8 },
      ],
    },
  ],
  ...more,
});

const sets = (xs: [number, number][]): SetResult[] => xs.map(([load, reps]) => ({ load, reps }));
const session = (date: string, runsheetId: string, h: [number, number][], p: [number, number][] = []): SessionResult => ({
  id: `${runsheetId}@${date}`,
  runsheetId,
  startedAt: `${date}T10:00:00`,
  steps: [{ stepId: 's1', exerciseKey: 'bb_hip_thrust', sets: sets(h) }, ...(p.length ? [{ stepId: 's2', exerciseKey: 'db_shoulder_press', sets: sets(p) }] : [])],
});
const table = (r: Runsheet, results: SessionResult[], workouts: Runsheet[]) => weekTable(r, results, workouts, k => k, k => (k === 'db_shoulder_press' ? 'kg per arm' : 'kg'));

describe('week table', () => {
  it('follows duplicates both ways and edited copies, and nothing else', () => {
    const w1 = sheet('w1');
    const w2 = sheet('w2', { duplicatedFrom: 'w1' });
    const w3 = sheet('w3', { duplicatedFrom: 'w2' });
    const other = sheet('other');
    const copy = sheet('c1', { copyOf: 'w1' });
    const all = [w1, w2, w3, other, copy];
    const ids = (r: Runsheet) => [...weekFamily(r, all)].sort();
    expect(ids(w3)).toEqual(['w1', 'w2', 'w3']);
    expect(ids(w1)).toEqual(['w1', 'w2', 'w3']);
    expect(ids(copy)).toEqual(['c1', 'w1', 'w2', 'w3']);
    expect(ids(other)).toEqual(['other']);
  });

  it('a column per session, weeks counted from the first, the newest marked latest', () => {
    const w1 = sheet('w1');
    const w2 = sheet('w2', { duplicatedFrom: 'w1' });
    // Mon 2 Nov 2026, Wed 4 Nov (same week), Mon 9 Nov, Sun 22 Nov.
    const results = [
      session('2026-11-02', 'w1', [[100, 8]]),
      session('2026-11-04', 'w1', [[100, 8]]),
      session('2026-11-09', 'w2', [[105, 8]]),
      session('2026-11-22', 'w2', [[105, 9]]),
      session('2026-11-10', 'elsewhere', [[200, 1]]),
    ];
    const t = table(w2, results, [w1, w2]);
    expect(t.columns.map(c => c.label)).toEqual(['Wk 1', 'Wk 1', 'Wk 2', 'Wk 3']);
    expect(t.columns.map(c => c.latest)).toEqual([false, false, false, true]);
  });

  it('rows are exercise × set in workout order; cells say what was done and what changed', () => {
    const w = sheet('w');
    const results = [
      session('2026-11-02', 'w', [[100, 8], [110, 4], [110, 4]], [[12.5, 8]]),
      session('2026-11-09', 'w', [[105, 8], [110, 5], [105, 4]], [[12.5, 8]]),
    ];
    const t = table(w, results, [w]);
    expect(t.rows.map(r => r.id)).toEqual(['bb_hip_thrust#0', 'bb_hip_thrust#1', 'bb_hip_thrust#2', 'db_shoulder_press#0']);
    expect(t.rows[0].cells[1]).toMatchObject({ text: '105 × 8', delta: '+5 kg', better: true });
    expect(t.rows[1].cells[1]?.delta).toBe('+1 rep');
    expect(t.rows[2].cells[1]).toMatchObject({ delta: '−5 kg', better: false });
    expect(t.rows[3].cells[1]?.delta).toBeUndefined();
    expect(t.rows[0].cells[0]?.delta).toBeUndefined();
    expect(t.rows[0].name).toBe('Hip thrust');
  });

  it('a set missing in one week is a gap, and the next week compares with the last one that had it', () => {
    const w = sheet('w');
    const results = [session('2026-11-02', 'w', [[100, 8], [110, 4]]), session('2026-11-09', 'w', [[100, 8]]), session('2026-11-16', 'w', [[100, 8], [112.5, 4]])];
    const t = table(w, results, [w]);
    expect(t.rows[1].cells[1]).toBeNull();
    expect(t.rows[1].cells[2]?.delta).toBe('+2.5 kg');
  });

  it('warm-ups are left out, and no history is an empty table', () => {
    const w = sheet('w');
    const r = session('2026-11-02', 'w', [[100, 8]]);
    r.steps[0].sets = [{ reps: 10, load: 60, type: 'warmup' }, ...r.steps[0].sets!];
    expect(table(w, [r], [w]).rows).toHaveLength(1);
    expect(table(w, [], [w]).rows).toHaveLength(0);
  });

  it('a quick-logged activity is no column', () => {
    const w = sheet('w');
    const r: SessionResult = { ...session('2026-11-02', 'w', [[100, 8]]), activity: { name: 'Padel', minutes: 60 } };
    expect(table(w, [r], [w]).columns).toHaveLength(0);
  });

  it('deltas in kg and reps together, and in metres', () => {
    expect(weekDelta({ reps: 8, load: 100 }, { reps: 6, load: 110 }).text).toBe('+10 kg · −2 reps');
    expect(weekDelta({ meters: 400 }, { meters: 420 }).text).toBe('+20 m');
  });
});
