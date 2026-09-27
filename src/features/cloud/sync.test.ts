import { describe, expect, it, vi } from 'vitest';
import type { SessionResult } from '@/features/runsheet/progression';
import { clearSnap, fromRow, sync, toRow } from './sync';

// Supabase stand-in: every table call is written down and resolves empty.
const { calls, table } = vi.hoisted(() => {
  const calls: string[] = [];
  const table = (name: string): unknown => new Proxy({}, { get: (_, m) => (m === 'then' ? (res: (v: unknown) => void) => res({ data: [], error: null }) : () => (calls.push(`${name}.${String(m)}`), table(name))) });
  return { calls, table };
});
vi.mock('./client', () => ({ currentUser: () => ({ id: 'u2' }), sb: { from: table } }));

describe('session rows', () => {
  it('round-trips startedFrom through the v2 jsonb payload', () => {
    const r: SessionResult = { id: 's-y', runsheetId: 'cf-girls-fran', title: 'Fran', startedAt: '2026-09-20T10:00:00.000Z', startedFrom: 'recommended', steps: [] };
    const row = toRow(r, 'u');
    expect((row.data as { startedFrom?: string }).startedFrom).toBe('recommended');
    expect(fromRow({ id: row.id, data: row.data })).toEqual(r);
  });
  it('reads a row the iOS app wrote, with startedFrom at the top of data', () => {
    // Exactly what SessionRow.encode in ios/TigerWorkouts/Model/SessionResult.swift produces.
    const data = { format: 'v2', blocks: [], id: 's-1758960000000-run', runsheetId: 'u-1', startedFrom: 'mine', title: 'Mine', startedAt: '2026-09-27T10:00:00.000Z', endedAt: '2026-09-27T10:20:00.000Z', durationSec: 1200, completed: true, steps: [] };
    const r = fromRow({ id: 's-1758960000000-run', data });
    expect(r.startedFrom).toBe('mine');
    expect(r.runsheetId).toBe('u-1');
    expect(r).not.toHaveProperty('format');
  });
  it('reads a row written before the field existed', () => {
    const row = toRow({ id: 's-z', runsheetId: 'cf-girls-fran', startedAt: '2026-09-01T10:00:00.000Z', steps: [] }, 'u');
    expect(fromRow({ id: row.id, data: row.data }).startedFrom).toBeUndefined();
  });
});

describe('the next account on the device', () => {
  it('pushes and deletes nothing when the last one signed out clean', async () => {
    clearSnap();
    const out = await sync({ results: [], workouts: [], favorites: [], saved: [], name: 'Nick', units: 'metric', trainingMaxes: {} });
    expect([out.error, out.patch.results, calls.filter(c => /upsert|delete/.test(c))]).toEqual([undefined, [], ['user_state.upsert']]);
  });
});
