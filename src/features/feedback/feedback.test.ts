import { describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import type { RunState } from '@/features/timer/runner';
import { buildContext, runSummary, screenName } from './context';
import { FEEDBACK_KEY, FEEDBACK_URL, sendFeedback } from './send';

const user = { id: 'u1', is_anonymous: false, email: 'a@b.c', app_metadata: { provider: 'email' } } as unknown as User;
const run = {
  state: {
    runsheetId: 'fran', title: 'Fran', i: 1, phase: 'work', startedAt: 1_000_000, slotStartedAt: 0, pausedMs: 10_000,
    slots: [{ id: 'a', kind: 'work', step: { kind: 'exercise', exercise: { name: 'Thrusters' } }, mode: 'fortime' }, { id: 'b', kind: 'work', step: { kind: 'exercise', exercise: { name: 'Pull-ups' } }, mode: 'fortime', blockName: '21-15-9' }],
    actuals: { a: { doneAt: 1_050_000 } }, dropped: [], blockStart: {}, blockDone: {},
  } as unknown as RunState,
  savedAt: 1_100_000,
};

describe('feedback context', () => {
  it('names the screen from the hash', () => {
    expect(screenName('#/w/abc?x=1')).toBe('w');
    expect(screenName('#/me')).toBe('me');
    expect(screenName('')).toBe('discover');
  });

  it('summarises a run in progress without the whole state', () => {
    const s = runSummary(run, 1_130_000)!;
    expect(s).toMatchObject({ workout_id: 'fran', slot: '2 of 2', step: 'Pull-ups', block: '21-15-9', paused: false, sets_done: 1, elapsed_s: 120 });
    expect(runSummary(null, 0)).toBeNull();
  });

  it('carries user, screen, session and build, and never a token', () => {
    const c = buildContext({ user, hash: '#/do/fran', recentScreens: ['#/', '#/w/fran', '#/do/fran'], run, errors: [{ at: 't', message: 'boom' }], build: 'b1', now: 1_130_000 });
    expect(c.user).toEqual({ id: 'u1', anonymous: false, email: 'a@b.c', provider: 'email' });
    expect(c.screen).toEqual({ name: 'do', path: '#/do/fran' });
    expect(c.session?.workout_title).toBe('Fran');
    expect(c.app.build).toBe('b1');
    expect(JSON.stringify(c)).not.toMatch(/token/i);
    expect(buildContext({ user: null, hash: '', recentScreens: [], run: null, errors: [], build: 'b' }).user).toBeNull();
  });
});

describe('sendFeedback', () => {
  it('posts the note with the app key and the bearer token', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await sendFeedback('  hi  ', { screen: 'me' }, 'tok', fetcher as unknown as typeof fetch);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(FEEDBACK_URL);
    expect((init.headers as Record<string, string>)['x-feedback-key']).toBe(FEEDBACK_KEY);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual({ app: 'tigerworkouts', text: 'hi', context: { screen: 'me' } });
  });

  it('throws the Worker error so the sheet can show it', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: 'Too many notes this hour.' }), { status: 429 }));
    await expect(sendFeedback('x', {}, null, fetcher as unknown as typeof fetch)).rejects.toThrow('Too many notes this hour.');
  });
});
