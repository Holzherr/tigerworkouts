import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionResult } from '@/features/runsheet/progression';
import { setState, useActions } from '@/app/store';
import { signOut } from './client';
import { sync, type SyncResult, type SyncTarget } from './sync';
import { useCloudSync } from './use-sync';

// The Supabase client is the fake; the cloud modules are real, only `sync` itself is stubbed.
const { fake } = vi.hoisted(() => {
  const fake = { auth: { onAuthStateChange: (cb: (e: string, s: unknown) => void) => (fake.onAuth = cb), signOut: async () => ({ error: null }) }, onAuth: (_e: string, _s: unknown) => {} };
  return { fake };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake }));
vi.mock('./sync', async importOriginal => ({ ...(await importOriginal<typeof import('./sync')>()), sync: vi.fn() }));
vi.mock('@/app/store', async importOriginal => ((m: typeof import('@/app/store')) => ({ ...m, setState: vi.fn(m.setState) }))(await importOriginal()));

const mocked = vi.mocked(sync);
const row = (id: string, score?: number): SessionResult => ({ id, runsheetId: 'w', startedAt: `2026-09-27T1${id.length}:00:00.000Z`, steps: [], score });
const settle = (local: SyncTarget, changed = true): SyncResult => ({ patch: { ...local, results: [...local.results].sort((a, b) => b.startedAt.localeCompare(a.startedAt)) }, changed });
const stored = () => JSON.parse(localStorage.getItem('workout-hub-next:v1')!);

beforeEach(() => {
  fake.onAuth('SIGNED_IN', { user: { id: 'u1' } });
  mocked.mockReset();
  setState({ results: [row('s-a')], workouts: [], favorites: [], saved: [], exercises: {}, trainingMaxes: {}, name: 'Fixture', signedIn: true, syncError: undefined });
  vi.mocked(setState).mockClear();
});

describe('cloud sync', () => {
  it('keeps a result saved while a sync ran and pushes it next', async () => {
    let finish!: (r: SyncResult) => void;
    mocked.mockImplementationOnce(() => new Promise(r => (finish = r))).mockImplementation(async l => settle(l, false));
    renderHook(() => useCloudSync());
    const local = mocked.mock.calls[0][0];
    act(() => useActions().addResult(row('s-new', 7)));
    await act(async () => finish(settle(local)));
    expect(stored().results.map((r: SessionResult) => r.id)).toEqual(['s-new', 's-a']);
    expect(mocked.mock.calls.map(c => c[0].results.find(r => r.id === 's-new')?.score)).toEqual([undefined, 7]);
  });

  it('writes once and does not run again when nothing moved', async () => {
    vi.useFakeTimers();
    mocked.mockImplementation(async l => settle(l));
    renderHook(() => useCloudSync());
    await act(async () => void (await vi.advanceTimersByTimeAsync(5000)));
    expect(mocked).toHaveBeenCalledTimes(1);
    expect(setState).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('sign-out is held while the push fails, then leaves nothing on the device for the next account', async () => {
    localStorage.setItem('tiger:synced', '{"s-a":"x"}');
    mocked.mockImplementationOnce(async l => ({ ...settle(l, false), error: 'offline' })).mockImplementation(async l => settle(l, false));
    await expect(signOut()).rejects.toThrow(/offline/);
    expect([stored().results.length, stored().syncError]).toEqual([1, expect.stringMatching(/Not signed out/)]);
    await signOut();
    const s = stored();
    expect([s.results, s.workouts, s.favorites, s.saved, Object.keys(s.exercises), Object.keys(s.trainingMaxes), s.signedIn, localStorage.getItem('tiger:synced')]).toEqual([[], [], [], [], [], [], false, null]);
  });
});
