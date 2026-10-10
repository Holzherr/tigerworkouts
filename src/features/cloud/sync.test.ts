import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { SessionResult } from '@/features/runsheet/progression';
import { eachRow, fetchCreator, fromRow, toRow } from './sync';

// A Supabase client that records each select and answers from `rows`.
const cloud = vi.hoisted(() => ({ selects: [] as string[], rows: {} as Record<string, unknown> }));
vi.mock('./client', () => ({
  currentUser: () => null,
  sb: {
    from: (table: string) => {
      const q = {
        select: (cols: string) => (cloud.selects.push(`${table}:${cols}`), q),
        eq: () => q,
        maybeSingle: async () => ({ data: cloud.rows[table] ?? null }),
        order: async () => ({ data: cloud.rows[table] ?? [] }),
      };
      return q;
    },
  },
}));

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

describe('a creator page', () => {
  it('asks profiles for id, name, handle and bio only, and reads a missing name as Creator', async () => {
    cloud.rows = { profiles: { id: 'u-1', name: null, handle: 'priyanka', bio: null }, workouts: [] };
    const r = await fetchCreator('priyanka');
    expect(cloud.selects).toContain('profiles:id,name,handle,bio');
    expect(cloud.selects.some(s => s.startsWith('profiles:*'))).toBe(false);
    expect(r?.profile).toEqual({ id: 'u-1', name: 'Creator', handle: 'priyanka', bio: undefined });
  });
});

describe('migration 0007: the public key reads nothing private', () => {
  // vitest runs from the repo root (import.meta.url is not a file: URL under jsdom).
  const sql = readFileSync('legacy/supabase/migrations/0007_public_key_reads_nothing_private.sql', 'utf8');
  it('runs the three exercise views as the caller and takes them away from anon', () => {
    for (const v of ['workout_exercise_refs', 'exercise_usage', 'exercise_demand']) {
      expect(sql).toMatch(new RegExp(`^alter view public\\.${v} set \\(security_invoker = true\\);`, 'm'));
      expect(sql).toMatch(new RegExp(`^revoke select on [^;]*public\\.${v}[^;]* from anon;`, 'm'));
    }
  });
  it('shows other people only profiles with a handle, and stops naming people after their email', () => {
    expect(sql).toMatch(/^alter policy "profiles: creators visible" on public\.profiles using \(handle is not null\);/m);
    expect(sql).toMatch(/^create or replace function public\.handle_new_user\(\)/m);
    expect(sql).not.toContain('split_part(new.email');
    expect(sql).toMatch(/^update public\.profiles p set name = null\s+from auth\.users u\s+where u\.id = p\.id and p\.name = split_part\(u\.email, '@', 1\);/m);
  });
});
