import { beforeEach, describe, expect, it } from 'vitest';
import { decodeShared } from '@/features/share/link';
import { allowed, ttlFor } from '../src/access';
import { RunsheetError, runsheetInput, type RunsheetInput } from '../src/runsheet';
import { handleMcp } from '../src/server';
import { db as makeDb, type Db } from '../src/supabase';
import * as T from '../src/tools';
import { fakeSupabase, tokenFor, type Tables } from './fake-supabase';

const NICK = '71ee1910-ef0a-471d-81bb-345ce7b9c2e3';
const OTHER = '00000000-0000-4000-8000-000000000002';

const draft = (over: Partial<RunsheetInput> = {}): RunsheetInput =>
  runsheetInput.parse({
    title: 'Upper push',
    items: [
      { kind: 'exercise', exercise: 'cardio_rower', forMode: 'minutes', forValue: 5, role: 'warmup' },
      { kind: 'block', repeat: 4, steps: [{ kind: 'exercise', exercise: 'bb_bench', forMode: 'reps', forValue: 6, target: 60 }, { kind: 'rest', seconds: 120 }] },
    ],
    ...over,
  });

let tables: Tables;
let fake: ReturnType<typeof fakeSupabase>;
let db: Db;
const as = (uid: string) => makeDb({ userId: uid, accessToken: tokenFor(uid) }, fake.fetch);

beforeEach(() => {
  tables = {
    profiles: [{ id: NICK, name: 'Nick', units: 'metric' }, { id: OTHER, name: 'Priyanka', units: 'metric' }],
    user_state: [{ owner: NICK, favorites: [], prefs: { name: 'Nick', bodyweightKg: 82, trainingMaxes: { bb_bench: 80 }, saved: ['cf-fran'] } }],
    workouts: [
      { id: 'u-mine', owner: NICK, creator: 'Nick', title: 'Nick legs', public: false, data: { id: 'u-mine', title: 'Nick legs', items: [{ kind: 'exercise', id: 'e1', exercise: { key: 'bb_back_squat', name: 'Back squat', unit: 'kg', step: 2.5 }, forMode: 'reps', forValue: 5, target: 100 }] }, updated_at: '2026-09-20T10:00:00Z' },
      { id: 'u-theirs-public', owner: OTHER, creator: 'Priyanka', title: 'Priyanka circuit', public: true, data: { id: 'u-theirs-public', title: 'Priyanka circuit', items: [{ kind: 'rest', id: 'r1', seconds: 30 }] }, updated_at: '2026-09-19T10:00:00Z' },
      { id: 'u-theirs-private', owner: OTHER, creator: 'Priyanka', title: 'Priyanka secret', public: false, data: { id: 'u-theirs-private', title: 'Priyanka secret', items: [] } },
    ],
    sessions: [
      { id: 's-1', owner: NICK, workout_id: 'u-mine', type: 'v2', title: 'Nick legs', started_at: '2026-09-21T07:00:00Z', ended_at: '2026-09-21T07:40:00Z', duration_min: 40, completed: true, data: { format: 'v2', blocks: [], runsheetId: 'u-mine', title: 'Nick legs', startedAt: '2026-09-21T07:00:00Z', durationSec: 2400, steps: [{ stepId: 'e1', exerciseKey: 'bb_back_squat', target: 100, reps: [5, 5, 5, 4], success: false }], notes: 'last set grindy' } },
      { id: 's-2', owner: NICK, workout_id: 'u-mine', type: 'v2', title: 'Nick legs', started_at: '2026-09-14T07:00:00Z', completed: true, data: { format: 'v2', blocks: [], runsheetId: 'u-mine', startedAt: '2026-09-14T07:00:00Z', steps: [{ stepId: 'e1', exerciseKey: 'bb_back_squat', target: 97.5, reps: [5, 5, 5, 5], success: true }] } },
      { id: 's-other', owner: OTHER, workout_id: 'x', type: 'v2', title: 'Hers', started_at: '2026-09-22T07:00:00Z', completed: true, data: { format: 'v2', blocks: [], runsheetId: 'x', startedAt: '2026-09-22T07:00:00Z', steps: [] } },
    ],
    exercises: [{ key: 'nick_sled', owner: NICK, public: true, data: { name: 'Sled push', unit: 'kg', step: 10, group: 'gym', cue: 'Low hips' } }],
  };
  fake = fakeSupabase(tables);
  db = as(NICK);
});

describe('reads', () => {
  it('every call goes to Supabase with the user’s own token', async () => {
    await T.getProfile(db, 'nick@example.com');
    expect(fake.calls.length).toBeGreaterThan(0);
    expect(fake.calls.every(c => c.auth === `Bearer ${tokenFor(NICK)}`)).toBe(true);
  });

  it('get_profile reads prefs, maxes and counts', async () => {
    const p = await T.getProfile(db, 'nick@example.com');
    expect(p).toMatchObject({ userId: NICK, name: 'Nick', bodyweightKg: 82, trainingMaxes: { bb_bench: 80 }, savedWorkoutIds: ['cf-fran'], ownWorkouts: 1 });
  });

  it('list_sessions returns own sessions, newest first, with per-exercise actuals', async () => {
    const { sessions } = await T.listSessions(db, {});
    expect(sessions.map(s => s.id)).toEqual(['s-1', 's-2']);
    expect(sessions[0].exercises[0]).toEqual({ exerciseKey: 'bb_back_squat', name: 'Barbell back squat', load: 100, incline: undefined, reps: [5, 5, 5, 4], success: false });
    expect(sessions[0]).toMatchObject({ durationMin: 40, notes: 'last set grindy' });
  });

  it('list_sessions filters by date', async () => {
    const { sessions } = await T.listSessions(db, { since: '2026-09-20T00:00:00Z' });
    expect(sessions.map(s => s.id)).toEqual(['s-1']);
  });

  it('get_session will not return someone else’s session', async () => {
    await expect(T.getSession(db, 's-other')).rejects.toBeInstanceOf(T.ToolError);
    const s = await T.getSession(db, 's-1');
    expect(s.workout?.outline).toContain('Back squat · 5 reps · 100 kg');
  });

  it('list_workouts mixes own, public and catalogue, never someone else’s private ones', async () => {
    const all = await T.listWorkouts(db, { limit: 100 });
    const ids = all.workouts.map(w => w.id);
    expect(ids.slice(0, 2)).toEqual(['u-mine', 'u-theirs-public']);
    expect(ids).not.toContain('u-theirs-private');
    expect(all.total).toBeGreaterThan(400);
    expect(all.workouts[0]).toMatchObject({ owner: 'me', public: false });
  });

  it('list_workouts filters by scope, query, source and length', async () => {
    expect((await T.listWorkouts(db, { scope: 'mine' })).workouts.map(w => w.id)).toEqual(['u-mine']);
    const fran = await T.listWorkouts(db, { scope: 'catalogue', query: 'fran' });
    expect(fran.workouts.some(w => w.title === 'Fran')).toBe(true);
    const coaches = await T.listWorkouts(db, { source: 'coaches', maxMinutes: 20 });
    expect(coaches.workouts.length).toBeGreaterThan(0);
    expect(coaches.workouts.every(w => w.source === 'coaches' && w.minutes <= 20)).toBe(true);
  });

  it('get_workout finds catalogue workouts and says they are not editable', async () => {
    const w = await T.getWorkout(db, 'coach-circuit-15');
    expect(w).toMatchObject({ owner: 'catalogue', canEdit: false, source: 'coaches' });
    expect(w.outline).toContain('Warm-up:');
    expect(w.runsheet.items.length).toBeGreaterThan(0);
  });

  it('search_exercises finds library and own custom exercises', async () => {
    expect((await T.searchExercises(db, { query: 'bench' })).exercises.some(e => e.key === 'bb_bench')).toBe(true);
    expect((await T.searchExercises(db, { query: 'sled' })).exercises[0]).toMatchObject({ key: 'nick_sled', mine: true });
  });
});

describe('writes', () => {
  it('create_workout saves a private, model-shaped workout owned by the user', async () => {
    const out = await T.createWorkout(db, { workout: draft() });
    expect(out.public).toBe(false);
    const row = tables.workouts.find(w => w.id === out.id)!;
    expect(row).toMatchObject({ owner: NICK, public: false, creator: 'Nick', title: 'Upper push' });
    const data = row.data as { items: { kind: string; id: string; name?: string; steps?: { exercise?: { name: string; unit: string } }[] }[]; source: { kind: string } };
    expect(data.source.kind).toBe('user');
    expect(data.items.every(i => i.id)).toBe(true);
    expect(data.items[1].name).toBe('Barbell bench press');
    expect(data.items[1].steps![0].exercise).toMatchObject({ name: 'Barbell bench press', unit: 'kg' });
    expect(out.minutes).toBeGreaterThan(10);
    expect(out.appUrl).toBe(`https://tigerworkouts.com/#/w/${out.id}`);
  });

  it('create_workout can publish when asked', async () => {
    const out = await T.createWorkout(db, { workout: draft(), public: true });
    expect(tables.workouts.find(w => w.id === out.id)!.public).toBe(true);
  });

  it('create_workout rejects unknown exercise keys and broken blocks, listing every problem', async () => {
    const bad = draft({ items: [{ kind: 'exercise', exercise: 'no_such_thing', forMode: 'reps', forValue: 5 }, { kind: 'block', repeat: 1, mode: 'amrap', steps: [{ kind: 'rest', seconds: 10 }] }] });
    const err = await T.createWorkout(db, { workout: bad }).catch(e => e);
    expect(err).toBeInstanceOf(RunsheetError);
    expect(err.message).toContain('unknown exercise key "no_such_thing"');
    expect(err.message).toContain('amrap block needs timeCapSec');
    expect(tables.workouts).toHaveLength(3);
  });

  it('the input schema rejects shapes the model does not have', () => {
    expect(runsheetInput.safeParse({ title: 'x', items: [{ kind: 'exercise', exercise: 'bb_bench', forMode: 'sets', forValue: 5 }] }).success).toBe(false);
    expect(runsheetInput.safeParse({ title: 'x', items: [] }).success).toBe(false);
  });

  it('update_workout replaces own workouts and keeps the id', async () => {
    const out = await T.updateWorkout(db, { id: 'u-mine', workout: draft({ title: 'Legs v2' }) });
    expect(out.title).toBe('Legs v2');
    const row = tables.workouts.find(w => w.id === 'u-mine')!;
    expect(row.title).toBe('Legs v2');
    expect((row.data as { id: string }).id).toBe('u-mine');
    expect(row.public).toBe(false);
  });

  it('update_workout flips visibility alone', async () => {
    await T.updateWorkout(db, { id: 'u-mine', public: true });
    expect(tables.workouts.find(w => w.id === 'u-mine')!.public).toBe(true);
  });

  it('update_workout refuses other people’s and catalogue workouts', async () => {
    await expect(T.updateWorkout(db, { id: 'u-theirs-public', public: false })).rejects.toThrow(/not yours/);
    await expect(T.updateWorkout(db, { id: 'coach-circuit-15', public: true })).rejects.toThrow(/catalogue/);
    expect(tables.workouts.find(w => w.id === 'u-theirs-public')!.public).toBe(true);
  });

  it('preview_workout_url is the app’s own share link and decodes back to the workout', async () => {
    const { previewUrl } = await T.previewWorkoutUrl(db, { workout: draft() });
    expect(previewUrl.startsWith('https://tigerworkouts.com/#/import/')).toBe(true);
    const back = decodeShared(previewUrl.split('#/import/')[1]);
    expect(back?.title).toBe('Upper push');
    expect((await T.previewWorkoutUrl(db, { id: 'u-mine' })).title).toBe('Nick legs');
  });
});

describe('access', () => {
  it('the allowlist admits listed ids, and an empty list admits everyone', () => {
    expect(allowed({ ALLOWED_USER_IDS: NICK }, NICK)).toBe(true);
    expect(allowed({ ALLOWED_USER_IDS: NICK }, OTHER)).toBe(false);
    expect(allowed({ ALLOWED_USER_IDS: `${OTHER}, ${NICK}` }, NICK)).toBe(true);
    expect(allowed({ ALLOWED_USER_IDS: '' }, OTHER)).toBe(true);
  });

  it('client tokens expire before the Supabase token does', () => {
    expect(ttlFor({ expiresAt: 1000 + 3600 }, 1000)).toBe(3480);
    expect(ttlFor({ expiresAt: 1000 }, 1000)).toBe(60);
  });
});

describe('over MCP', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = async (body: unknown): Promise<any> => (await call(body)).json();
  const call = (body: unknown) =>
    handleMcp(new Request('https://mcp.test/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify(body) }), db);

  it('initializes, lists the tools and calls one', async () => {
    const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
    expect(init.result.serverInfo.name).toBe('tigerworkouts');
    expect(init.result.instructions).toContain('runsheet');

    const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(list.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(['create_workout', 'get_profile', 'get_session', 'get_workout', 'list_sessions', 'list_workouts', 'preview_workout_url', 'search_exercises', 'update_workout']);

    const call = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'create_workout', arguments: { workout: draft() } } });
    expect(call.result.isError).toBeFalsy();
    expect(JSON.parse(call.result.content[0].text)).toMatchObject({ title: 'Upper push', public: false });
  });

  it('reports a fixable workout as a tool error, not a crash', async () => {
    const call = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'create_workout', arguments: { workout: { title: 'x', items: [{ kind: 'exercise', exercise: 'nope', forMode: 'reps', forValue: 5 }] } } } });
    expect(call.result.isError).toBe(true);
    expect(call.result.content[0].text).toContain('unknown exercise key "nope"');
  });
});
