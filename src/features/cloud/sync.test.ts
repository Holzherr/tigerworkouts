import { describe, expect, it } from 'vitest';
import type { SessionResult } from '@/features/runsheet/progression';
import { eachRow, fromRow, toRow } from './sync';

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

describe('pushing your own exercises', () => {
  it('sends each on its own, so one the server refuses does not stop the rest', async () => {
    const sent: string[] = [];
    const errors = await eachRow(['u_a', 'u_sled_push', 'u_c'], async key => {
      if (key === 'u_sled_push') return { error: { message: 'new row violates row-level security policy' } };
      sent.push(key);
      return { error: null };
    });
    expect(sent).toEqual(['u_a', 'u_c']);
    expect(errors).toEqual(['new row violates row-level security policy']);
  });
});
