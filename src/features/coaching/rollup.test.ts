import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeExercise, type Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import { EX } from '@/features/runsheet/fixtures';
import { clientRollup, daysAgo, doneBy, prescribedVsDone, weekSummary } from './rollup';

// Thursday 1 Oct 2026, midday; the week started Monday 28 Sep.
const now = new Date(2026, 9, 1, 12);

describe('who trained this week, who has gone quiet', () => {
  const clients = [
    { id: 'a', name: 'Ana', since: '2026-08-01T10:00:00Z' },
    { id: 'b', name: 'Ben', since: '2026-08-01T10:00:00Z' },
    { id: 'c', name: 'Cat', since: new Date(2026, 8, 29).toISOString() },
    { id: 'd', name: 'Dan', since: '2026-08-01T10:00:00Z' },
  ];
  const sessions = [
    { owner: 'a', startedAt: new Date(2026, 8, 29, 7).toISOString() },
    { owner: 'a', startedAt: new Date(2026, 8, 30, 7).toISOString() },
    { owner: 'b', startedAt: new Date(2026, 8, 27, 18).toISOString() }, // Sunday: last week
    { owner: 'd', startedAt: new Date(2026, 8, 20, 9).toISOString() },
  ];
  const rows = clientRollup(clients, sessions, now);

  it('counts sessions since Monday and keeps the latest as last active', () => {
    const a = rows.find(r => r.id === 'a')!;
    expect(a.sessionsThisWeek).toBe(2);
    expect(a.lastActive).toBe(sessions[1].startedAt);
    expect(rows.find(r => r.id === 'b')!.sessionsThisWeek).toBe(0);
  });
  it('flags seven days without a session as quiet, counted from joining when there is none', () => {
    expect(rows.find(r => r.id === 'd')!.quiet).toBe(true);
    expect(rows.find(r => r.id === 'b')!.quiet).toBe(false);
    expect(rows.find(r => r.id === 'c')!.quiet).toBe(false);
  });
  it('lists quiet clients first', () => {
    expect(rows[0].id).toBe('d');
  });
  it('sums the week', () => {
    expect(weekSummary(rows)).toEqual({ clients: 4, trained: 1, sessions: 2, quiet: 1 });
  });
  it('reads last active as days', () => {
    expect(daysAgo(new Date(2026, 9, 1, 6).toISOString(), now)).toBe('today');
    expect(daysAgo(new Date(2026, 8, 30, 23).toISOString(), now)).toBe('yesterday');
    expect(daysAgo(new Date(2026, 8, 20).toISOString(), now)).toBe('11 days ago');
  });
});

describe('an assignment is done', () => {
  const a = { workoutId: 'w-legs', createdAt: '2026-09-30T08:00:00Z' };
  it('by the first session of that workout after it was assigned', () => {
    const s = [
      { id: 'old', runsheetId: 'w-legs', startedAt: '2026-09-29T08:00:00Z' },
      { id: 'other', runsheetId: 'w-arms', startedAt: '2026-09-30T09:00:00Z' },
      { id: 'second', runsheetId: 'w-legs', startedAt: '2026-10-01T08:00:00Z' },
      { id: 'first', runsheetId: 'w-legs', startedAt: '2026-09-30T18:00:00Z' },
    ];
    expect(doneBy(a, s)?.id).toBe('first');
    expect(doneBy(a, s.slice(0, 2))).toBeUndefined();
  });
});

describe('prescribed against done', () => {
  const plan: Runsheet = {
    id: 'w',
    title: 'Legs',
    items: [
      { kind: 'block', id: 'b', name: 'Squat', repeat: 3, steps: [{ ...makeExercise(EX.bb_back_squat, { target: 60, forMode: 'reps', forValue: 8 }), id: 'sq' }] },
      { ...makeExercise(EX.bb_rdl, { target: 50, forMode: 'reps', forValue: 10 }), id: 'rdl' },
      { ...makeExercise(EX.incline_walk, { forMode: 'minutes', forValue: 10, target: 6 }), id: 'walk' },
    ],
  };
  const result: SessionResult = {
    runsheetId: 'w',
    startedAt: '2026-10-01T08:00:00Z',
    steps: [
      { stepId: 'sq', exerciseKey: 'bb_back_squat', sets: [{ load: 40, reps: 10, type: 'warmup' }, { load: 60, reps: 8 }, { load: 60, reps: 8 }, { load: 60, reps: 6 }] },
      { stepId: 'walk', exerciseKey: 'incline_walk', sets: [{ load: 6, seconds: 600 }] },
      { stepId: 'x', exerciseKey: 'bw_pushup', sets: [{ reps: 20 }] },
    ],
  };
  const rows = prescribedVsDone(plan, result, k => ({ name: EX[k]?.name ?? k, unit: EX[k]?.unit ?? '' }));

  it('reads the plan and the working sets, warm-ups left out', () => {
    expect(rows[0]).toMatchObject({ stepId: 'sq', planned: '3 × 8 reps @ 60 kg', done: '60 × 8, 60 × 8, 60 × 6' });
  });
  it('marks a set under the reps as short, a missing step as skipped, an added one as extra', () => {
    expect(rows.map(r => r.verdict)).toEqual(['short', 'skipped', 'hit', 'extra']);
    expect(rows[3]).toMatchObject({ name: EX.bw_pushup.name, planned: '', done: '20 reps' });
  });
  it('is a hit when every prescribed set is done at its reps and load', () => {
    const full = { ...result, steps: [{ stepId: 'sq', exerciseKey: 'bb_back_squat', sets: [{ load: 60, reps: 8 }, { load: 62.5, reps: 8 }, { load: 60, reps: 9 }] }] };
    expect(prescribedVsDone(plan, full)[0].verdict).toBe('hit');
  });
  it('lists per-set plans set by set', () => {
    const ramp: Runsheet = { title: 'Ramp', items: [{ kind: 'block', id: 'b', name: 'Bench', repeat: 3, steps: [{ ...makeExercise(EX.bb_bench, { target: 60, forMode: 'reps', forValue: 5 }), id: 'bp', sets: [{}, { load: 65, reps: 3 }, { load: 70, reps: 1 }] }] }] };
    expect(prescribedVsDone(ramp, { runsheetId: 'r', startedAt: '', steps: [] })[0]).toMatchObject({ planned: '60 × 5, 65 × 3, 70 × 1', verdict: 'skipped' });
  });
  it('shows only what was done when there is no workout to compare', () => {
    expect(prescribedVsDone(undefined, result).map(r => r.verdict)).toEqual([undefined, undefined, undefined]);
  });
});

describe('migration 0008', () => {
  const sql = readFileSync('legacy/supabase/migrations/0008_coaching.sql', 'utf8');
  it('opens workouts, sessions and profiles to signed-in callers only, so guests still read public workouts', () => {
    for (const p of ['workouts: assigned to me', 'sessions: my coach reads', 'profiles: my coach or client']) expect(sql).toMatch(new RegExp(`create policy "${p}" on public\\.\\w+ for select to authenticated`));
  });
});
