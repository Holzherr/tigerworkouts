import { describe, expect, it } from 'vitest';
import type { SessionResult } from '@/features/runsheet/progression';
import { fromRow, toRow } from './sync';

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
