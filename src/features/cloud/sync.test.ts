import { describe, expect, it } from 'vitest';
import type { SessionResult } from '@/features/runsheet/progression';
import type { Runsheet } from '@/features/runsheet/model';
import { fromRow, toRow, workoutFromRow, workoutToRow } from './sync';

describe('session rows', () => {
  it('round-trips startedFrom through the v2 jsonb payload', () => {
    const r: SessionResult = { id: 's-y', runsheetId: 'cf-girls-fran', title: 'Fran', startedAt: '2026-09-20T10:00:00.000Z', startedFrom: 'recommended', steps: [] };
    const row = toRow(r, 'u');
    expect((row.data as { startedFrom?: string }).startedFrom).toBe('recommended');
    expect(fromRow({ id: row.id, data: row.data })).toEqual(r);
  });
  it('reads a row written before the field existed', () => {
    const row = toRow({ id: 's-z', runsheetId: 'cf-girls-fran', startedAt: '2026-09-01T10:00:00.000Z', steps: [] }, 'u');
    expect(fromRow({ id: row.id, data: row.data }).startedFrom).toBeUndefined();
  });
});

describe('workout visibility', () => {
  const w = (extra: Partial<Runsheet> = {}): Runsheet => ({ id: 'u-1', title: 'Mine', items: [], ...extra });

  it('a new workout goes up private', () => {
    expect(workoutToRow(w(), 'owner', 'Nick')).toMatchObject({ public: false, data: { public: false } });
  });

  it('a workout made public goes up public', () => {
    expect(workoutToRow(w({ public: true }), 'owner', 'Nick').public).toBe(true);
  });

  it('an edit never flips the visibility a row already has', () => {
    // Made private elsewhere (another device, the MCP server): an edit here without the field keeps it so.
    expect(workoutToRow(w(), 'owner', 'Nick', false).public).toBe(false);
    // Public on the server from before the field existed: it stays public.
    expect(workoutToRow(w(), 'owner', 'Nick', true).public).toBe(true);
  });

  it('reads visibility from the column, not the copy inside data', () => {
    expect(workoutFromRow({ id: 'u-1', data: { title: 'Mine', items: [], public: true }, public: false }).public).toBe(false);
    expect(workoutFromRow({ id: 'u-1', data: { title: 'Mine', items: [] }, public: true }).public).toBe(true);
  });
});
