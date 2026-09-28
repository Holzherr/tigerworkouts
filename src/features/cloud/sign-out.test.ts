import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { getState, setState } from '@/app/store';
import type { SessionResult } from '@/features/runsheet/progression';
import { signOut } from './client';
import { clearSnap, sync } from './sync';

// Supabase stand-in: every table call is written down; rows upserted as a list are kept and come
// back from a select. `fail` makes each upsert fail with that message; `duringSelect` runs once
// while a sync is out, between its pull and its push.
const fake = vi.hoisted(() => {
  const rows: Record<string, Record<string, { id: string }>> = {};
  const f = {
    rows,
    calls: [] as string[],
    fail: '',
    duringSelect: undefined as (() => void) | undefined,
    onAuth: (_event: string, _session: unknown) => {},
    table: (name: string, ops: string[] = []): unknown =>
      new Proxy({}, {
        get: (_, m) => {
          if (m !== 'then') return (arg: unknown) => (m === 'upsert' && !f.fail && Array.isArray(arg) && (arg as { id: string }[]).forEach(r => ((rows[name] ??= {})[r.id] = r)), f.table(name, [...ops, `${name}.${String(m)}`]));
          return (resolve: (v: unknown) => void) => {
            f.calls.push(...ops);
            if (ops.includes('sessions.select')) (f.duringSelect?.(), (f.duringSelect = undefined));
            resolve({ data: ops.includes(`${name}.select`) ? Object.values(rows[name] ?? {}) : [], error: f.fail && ops.some(o => o.endsWith('.upsert')) ? { message: f.fail } : null });
          };
        },
      }),
  };
  return f;
});
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { onAuthStateChange: (cb: typeof fake.onAuth) => (fake.onAuth = cb), signOut: async () => (fake.calls.push('auth.signOut'), { error: null }) },
    from: (name: string) => fake.table(name),
  }),
}));

const row = (id: string): SessionResult => ({ id, runsheetId: 'mine', title: 'Mine', startedAt: '2026-09-27T10:00:00.000Z', steps: [] });
const ids = () => getState().results.map(r => r.id).sort();
const remembered = () => Object.keys(JSON.parse(localStorage.getItem('tiger:synced') ?? 'null') ?? {});
const pushes = () => fake.calls.filter(c => /^(sessions|workouts)\.(upsert|delete)$/.test(c));
const REFUSED = /not saved to your account yet/;

beforeEach(() => {
  cleanup();
  localStorage.clear();
  clearSnap();
  fake.calls.length = 0;
  fake.fail = '';
  for (const t of Object.keys(fake.rows)) delete fake.rows[t];
  fake.onAuth('SIGNED_IN', { user: { id: 'u1', email: 'one@example.com' } });
  setState({ signedIn: true, results: [row('s-a')], workouts: [], favorites: [], saved: [], exercises: {}, trainingMaxes: {}, syncError: undefined });
});

describe('sign-out', () => {
  it('is refused, and nothing is cleared, when the push fails', async () => {
    await sync(getState()); // s-a is on the server and remembered as seen
    setState(s => ({ results: [row('s-b'), ...s.results] }));
    fake.fail = 'network down';
    expect(await signOut()).toMatch(REFUSED);
    expect([ids(), getState().signedIn, remembered(), fake.calls.includes('auth.signOut')]).toEqual([['s-a', 's-b'], true, ['s-a'], false]);
  });
  it('is refused when a session is saved while the push is out', async () => {
    await sync(getState());
    fake.duringSelect = () => setState(s => ({ results: [row('s-b'), ...s.results] }));
    expect(await signOut()).toMatch(REFUSED);
    expect([ids(), getState().signedIn, remembered(), fake.calls.includes('auth.signOut')]).toEqual([['s-a', 's-b'], true, ['s-a'], false]);
  });
  it('pushes, signs out and empties the device, so the next sync pushes and deletes nothing', async () => {
    expect(await signOut()).toBeUndefined();
    const st = getState();
    expect([st.results, st.workouts, st.favorites, st.saved, st.exercises, st.trainingMaxes, st.signedIn]).toEqual([[], [], [], [], {}, {}, false]);
    expect([localStorage.getItem('tiger:synced'), pushes(), fake.calls.includes('auth.signOut')]).toEqual([null, ['sessions.upsert'], true]);
    fake.calls.length = 0;
    await sync(getState());
    expect(pushes()).toEqual([]);
  });
  it('leaves nothing of the first account for the second to push', async () => {
    await signOut();
    fake.onAuth('SIGNED_IN', { user: { id: 'u2', email: 'two@example.com' } });
    fake.calls.length = 0;
    await sync(getState());
    expect(pushes()).toEqual([]);
  });
  it('shows the reason on the Me tab and stays signed in', async () => {
    fake.fail = 'network down';
    location.hash = '#/me';
    render(createElement(App));
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText(REFUSED)).toBeTruthy();
    expect([getState().signedIn, fake.calls.includes('auth.signOut'), screen.queryByRole('button', { name: 'Sign out' })]).toEqual([true, false, expect.anything()]);
  });
});
