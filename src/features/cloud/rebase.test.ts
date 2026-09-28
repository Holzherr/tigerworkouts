import { describe, expect, it } from 'vitest';
import type { SessionResult } from '@/features/runsheet/progression';
import { rebase } from './rebase';
import type { SyncTarget } from './sync';

const s = (id: string, extra: Partial<SessionResult> = {}): SessionResult => ({ id, runsheetId: 'w', startedAt: `2026-09-2${id.length}T10:00:00.000Z`, steps: [], ...extra });
const base = (over: Partial<SyncTarget> = {}): SyncTarget => ({ results: [], workouts: [], favorites: [], saved: [], name: 'Nick', units: 'metric', trainingMaxes: {}, ...over });

describe('applying a sync over what changed while it ran', () => {
  it('keeps a workout that finished during the sync', () => {
    const snapshot = base({ results: [s('a')] });
    const current = base({ results: [s('b'), s('a')] });
    const out = rebase(current, snapshot, { results: [s('a', { rpe: 5 })] });
    expect(out.results?.map(r => r.id)).toEqual(['b', 'a']);
    expect(out.results?.find(r => r.id === 'a')?.rpe).toBe(5);
  });

  it('keeps a discard made during the sync', () => {
    const out = rebase(base({ results: [] }), base({ results: [s('a')] }), { results: [s('a'), s('z')] });
    expect(out.results?.map(r => r.id)).toEqual(['z']);
  });

  it('keeps an edit made during the sync over the server copy', () => {
    const out = rebase(base({ results: [s('a', { notes: 'mine' })] }), base({ results: [s('a')] }), { results: [s('a', { notes: 'server' })] });
    expect(out.results?.[0].notes).toBe('mine');
  });

  it('a pref changed during the sync is not overwritten, and keeps its newer stamp', () => {
    const snapshot = base({ name: 'Nick', prefsUpdatedAt: { name: '2026-09-28T10:00:00Z' } });
    const current = base({ name: 'Nicolas', prefsUpdatedAt: { name: '2026-09-28T10:00:05Z' } });
    const out = rebase(current, snapshot, { name: 'Nick', saved: ['x'], prefsUpdatedAt: { name: '2026-09-28T10:00:00Z', saved: '2026-09-28T09:00:00Z' } });
    expect(out.name).toBeUndefined();
    expect(out.saved).toEqual(['x']);
    expect(out.prefsUpdatedAt).toEqual({ name: '2026-09-28T10:00:05Z', saved: '2026-09-28T09:00:00Z' });
  });

  it('with nothing changed locally, the sync result applies as it was', () => {
    const snapshot = base({ results: [s('a')] });
    const patch = { results: [s('a', { rpe: 8 }), s('q')], name: 'Priyanka' };
    expect(rebase(snapshot, snapshot, patch)).toEqual(patch);
  });
});
