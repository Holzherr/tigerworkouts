/**
 * Three-way sync between the local store and Supabase. `snap` remembers each row's JSON as last
 * seen on the server, so local edits, server edits and deletes on either side are told apart:
 *   local changed, server same   → push
 *   server changed, local same   → pull (server wins)
 *   missing on server, unchanged → deleted there, drop locally
 *   missing locally, in snapshot → deleted here, delete there
 * Rows the v0.9 app wrote are converted on the way in and preserved on the way out.
 */
import type { Runsheet } from '@/features/runsheet/model';
import type { LibraryExercise } from '@/features/exercises/library';
import type { SessionResult, TrainingMaxes } from '@/features/runsheet/progression';
import type { Equipment } from '@/features/runsheet/plates';
import { currentUser, sb } from './client';
import { fromLegacySession, isLegacySession, legacyWorkoutToRunsheet, type LegacySession } from './legacy';
import { mergePrefs, prefsRow, remoteSide, type PrefStamps } from './prefs';

export interface SyncTarget {
  results: SessionResult[];
  workouts: Runsheet[];
  favorites: Favorite[];
  saved: string[];
  name: string;
  avatar?: Avatar;
  units: 'metric' | 'imperial';
  trainingMaxes: TrainingMaxes;
  bodyweightKg?: number;
  equipment?: Equipment;
  exercises?: Record<string, LibraryExercise>;
  /** When each shared pref was last changed on this device (prefs.ts). */
  prefsUpdatedAt?: PrefStamps;
}
export interface Favorite {
  name: string;
  icon?: string;
  minutes: number;
  intensity?: string;
}
export type Avatar = { emoji?: string; color?: string; photo?: string };

const SNAP_KEY = 'tiger:synced';
let snap: Record<string, string> = {};
try {
  snap = JSON.parse(localStorage.getItem(SNAP_KEY) || '{}') || {};
} catch {
  /* fresh */
}
const saveSnap = () => {
  try {
    localStorage.setItem(SNAP_KEY, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
};
const J = (o: unknown) => JSON.stringify(o);

const resultId = (r: SessionResult) => r.id ?? `${r.runsheetId}@${r.startedAt}`;
const ensureId = (r: SessionResult): SessionResult => (r.id ? r : { ...r, id: 's-' + Date.parse(r.startedAt).toString(36) + Math.random().toString(36).slice(2, 6) });

/** Session row payload. Legacy sessions go back in their own shape (plus edits); new ones as v2 with an empty blocks[] so the old app doesn't choke. */
export const toRow = (r: SessionResult, owner: string) => {
  const legacy = r.legacy as LegacySession | undefined;
  const data = legacy ? { ...legacy, notes: r.notes ?? legacy.notes, startedAt: r.startedAt, endedAt: r.endedAt ?? legacy.endedAt, duration_min: r.durationSec ? Math.round(r.durationSec / 60) : legacy.duration_min, v2: stripLegacy(r) } : { format: 'v2', blocks: [], ...stripLegacy(r) };
  return {
    id: resultId(r),
    owner,
    workout_id: r.activity ? null : r.runsheetId,
    type: r.activity ? 'activity' : legacy ? (legacy.type ?? 'workout') : 'v2',
    title: r.title ?? r.activity?.name ?? r.runsheetId,
    started_at: r.startedAt,
    ended_at: r.endedAt ?? null,
    duration_min: r.durationSec ? Math.round(r.durationSec / 60) : (r.activity?.minutes ?? legacy?.duration_min ?? 0),
    completed: r.completed ?? true,
    data,
  };
};
const stripLegacy = (r: SessionResult) => {
  const { legacy: _l, ...rest } = r;
  void _l;
  return rest;
};
export const fromRow = (row: { id: string; data: unknown }): SessionResult => {
  const d = row.data as Record<string, unknown>;
  if (d && d.format === 'v2') {
    const { format: _f, blocks: _b, ...rest } = d;
    void _f;
    void _b;
    return { ...(rest as unknown as SessionResult), id: row.id };
  }
  if (isLegacySession(d)) {
    const legacy = d as LegacySession & { v2?: SessionResult };
    if (legacy.v2) return { ...legacy.v2, legacy: { ...legacy, v2: undefined }, id: row.id };
    return fromLegacySession(legacy);
  }
  return { id: row.id, runsheetId: String((d as { workoutId?: string })?.workoutId ?? row.id), title: String((d as { title?: string })?.title ?? row.id), startedAt: String((d as { startedAt?: string })?.startedAt ?? new Date().toISOString()), steps: [] };
};

type WorkoutRow = { id: string; data: unknown; creator?: string | null; title?: string | null; public?: boolean | null; owner?: string | null };
const workoutFromRow = (row: WorkoutRow): Runsheet => {
  const d = row.data as Record<string, unknown>;
  const base = d && Array.isArray(d.items) ? { ...(d as unknown as Runsheet), id: row.id } : legacyWorkoutToRunsheet({ id: row.id, title: String(row.title ?? d?.title ?? row.id), creator: row.creator ?? undefined, blocks: (d?.blocks as never) ?? [] });
  // The row's column is the truth for who can see it; the copy inside `data` may be stale.
  return { ...base, public: row.public ?? base.public ?? false, ownerId: row.owner ?? undefined };
};
const workoutData = ({ ownerId: _, ...w }: Runsheet) => w;

export interface SyncResult {
  patch: Partial<SyncTarget>;
  error?: string;
  changed: boolean;
}

/** Send rows one at a time and collect what failed, so a row the server refuses (an exercise key
 * another account holds) does not stop the rest. */
export const eachRow = async <T>(items: T[], send: (x: T) => PromiseLike<{ error: { message: string } | null }>): Promise<string[]> => {
  const errors: string[] = [];
  for (const x of items) {
    const { error } = await send(x);
    if (error) errors.push(error.message);
  }
  return errors;
};

/** Pull then push. Returns what changed locally so the store can apply it. */
export const sync = async (local: SyncTarget): Promise<SyncResult> => {
  const user = currentUser();
  if (!user) return { patch: {}, changed: false };
  const uid = user.id;
  const patch: Partial<SyncTarget> = {};
  const errors: string[] = [];
  let changed = false;

  // ── sessions ──
  let results = local.results.map(ensureId);
  const { data: rows, error: e1 } = await sb.from('sessions').select('id,data').eq('owner', uid);
  if (e1) errors.push(e1.message);
  else {
    const remote = new Map((rows ?? []).map(r => [r.id as string, fromRow(r as { id: string; data: unknown })]));
    const remoteJ = new Map([...remote].map(([id, r]) => [id, J(r)]));
    remote.forEach((r, id) => {
      const i = results.findIndex(x => resultId(x) === id);
      const rj = remoteJ.get(id)!;
      if (i < 0) {
        if (!(id in snap)) {
          results = [...results, r];
          snap[id] = rj;
          changed = true;
        }
        return;
      }
      const lj = J(results[i]);
      if (!(id in snap) || (rj !== snap[id] && lj === snap[id])) {
        results = results.map((x, k) => (k === i ? r : x));
        snap[id] = rj;
        changed = true;
      }
    });
    const before = results.length;
    results = results.filter(x => {
      const id = resultId(x);
      if (!remote.has(id) && id in snap && J(x) === snap[id]) {
        delete snap[id];
        return false;
      }
      return true;
    });
    if (results.length !== before) changed = true;
    // push
    const dirty = results.filter(x => J(x) !== snap[resultId(x)]);
    if (dirty.length) {
      const { error } = await sb.from('sessions').upsert(dirty.map(x => toRow(x, uid)), { onConflict: 'id' });
      if (error) errors.push(error.message);
      else dirty.forEach(x => (snap[resultId(x)] = J(x)));
    }
    const gone = Object.keys(snap).filter(id => id.startsWith('s-') || /@/.test(id)).filter(id => !results.some(x => resultId(x) === id) && !id.startsWith('w:'));
    if (gone.length) {
      const { error } = await sb.from('sessions').delete().in('id', gone).eq('owner', uid);
      if (error) errors.push(error.message);
      else gone.forEach(id => delete snap[id]);
    }
    results.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    patch.results = results;
  }

  // ── own workouts (key "w:<id>" in the snapshot) ──
  const { data: wrows, error: e2 } = await sb.from('workouts').select('id,data,creator,title,public').eq('owner', uid);
  if (e2) errors.push(e2.message);
  else {
    let workouts = [...local.workouts];
    const remote = new Map((wrows ?? []).map(r => [r.id as string, workoutFromRow(r as WorkoutRow)]));
    remote.forEach((w, id) => {
      const k = `w:${id}`;
      const rj = J(w);
      const i = workouts.findIndex(x => x.id === id);
      if (i < 0) {
        if (!(k in snap)) {
          workouts = [...workouts, w];
          snap[k] = rj;
          changed = true;
        }
        return;
      }
      const lj = J(workouts[i]);
      if (!(k in snap) || (rj !== snap[k] && lj === snap[k])) {
        workouts = workouts.map((x, j) => (j === i ? w : x));
        snap[k] = rj;
        changed = true;
      }
    });
    const before = workouts.length;
    workouts = workouts.filter(w => {
      const k = `w:${w.id}`;
      if (!remote.has(w.id!) && k in snap && J(w) === snap[k]) {
        delete snap[k];
        return false;
      }
      return true;
    });
    if (workouts.length !== before) changed = true;
    const dirty = workouts.filter(w => w.id && J(w) !== snap[`w:${w.id}`]);
    if (dirty.length) {
      const { error } = await sb.from('workouts').upsert(dirty.map(w => ({ id: w.id!, owner: uid, creator: w.creator ?? local.name, title: w.title, public: w.public ?? remote.get(w.id!)?.public ?? false, data: workoutData(w) })), { onConflict: 'id' });
      if (error) errors.push(error.message);
      else dirty.forEach(w => (snap[`w:${w.id}`] = J(w)));
    }
    const gone = Object.keys(snap).filter(k => k.startsWith('w:') && !workouts.some(w => `w:${w.id}` === k));
    if (gone.length) {
      const { error } = await sb.from('workouts').delete().in('id', gone.map(k => k.slice(2))).eq('owner', uid);
      if (error) errors.push(error.message);
      else gone.forEach(k => delete snap[k]);
    }
    patch.workouts = workouts;
  }

  // ── custom exercises: union, push the ones the server lacks ──
  const { data: exRows } = await sb.from('exercises').select('key,data').eq('owner', uid);
  const exercises: Record<string, LibraryExercise> = { ...(local.exercises ?? {}) };
  for (const row of exRows ?? []) if (!exercises[row.key as string]) exercises[row.key as string] = { key: row.key as string, ...(row.data as Omit<LibraryExercise, 'key'>) };
  const missing = Object.values(exercises).filter(e => !(exRows ?? []).some(r => r.key === e.key));
  errors.push(...(await eachRow(missing, e => sb.from('exercises').upsert({ key: e.key, owner: uid, public: true, data: e }, { onConflict: 'key' }))));
  if (J(exercises) !== J(local.exercises ?? {})) {
    patch.exercises = exercises;
    changed = true;
  }

  // ── user state: the newer side wins per field (prefs.ts), favorites as before ──
  const { data: st, error: e3 } = await sb.from('user_state').select('favorites,prefs').eq('owner', uid).maybeSingle();
  if (e3) errors.push(e3.message);
  else {
    const remotePrefs = (st?.prefs ?? {}) as Record<string, unknown>;
    const m = mergePrefs(
      { values: { saved: local.saved, trainingMaxes: local.trainingMaxes, bodyweightKg: local.bodyweightKg, equipment: local.equipment, name: local.name, avatar: local.avatar, units: local.units }, updatedAt: local.prefsUpdatedAt ?? {} },
      remoteSide(remotePrefs)
    );
    const favorites = local.favorites.length ? local.favorites : ((st?.favorites as Favorite[] | null) ?? []);
    const v = m.values;
    const merged: Partial<SyncTarget> = {
      favorites,
      saved: (v.saved as string[] | undefined) ?? [],
      trainingMaxes: (v.trainingMaxes as TrainingMaxes | undefined) ?? {},
      bodyweightKg: v.bodyweightKg as number | undefined,
      equipment: v.equipment as Equipment | undefined,
      name: (v.name as string | undefined) ?? local.name,
      avatar: v.avatar as Avatar | undefined,
      units: (v.units as SyncTarget['units'] | undefined) ?? 'metric',
      prefsUpdatedAt: m.updatedAt,
    };
    const mine = { favorites: local.favorites, saved: local.saved, trainingMaxes: local.trainingMaxes, bodyweightKg: local.bodyweightKg, equipment: local.equipment, name: local.name, avatar: local.avatar, units: local.units, prefsUpdatedAt: local.prefsUpdatedAt ?? {} };
    if (J(merged) !== J(mine)) changed = true;
    Object.assign(patch, merged);
    if (m.push || J(favorites) !== J(st?.favorites ?? [])) {
      const { error } = await sb.from('user_state').upsert({ owner: uid, favorites, prefs: prefsRow(remotePrefs, m) }, { onConflict: 'owner' });
      if (error) errors.push(error.message);
      await sb.from('profiles').update({ name: merged.name, units: merged.units }).eq('id', uid);
      changed = true;
    }
  }
  saveSnap();
  return { patch, changed, error: errors[0] };
};

/** Public workouts other people made (creators), for Discover. */
export const fetchPublicWorkouts = async (): Promise<Runsheet[]> => {
  const { data } = await sb.from('workouts').select('id,data,creator,title,owner').eq('public', true);
  const me = currentUser()?.id;
  return (data ?? []).filter(r => r.owner !== me).map(r => workoutFromRow(r as WorkoutRow));
};

export interface CreatorProfile {
  id: string;
  name: string;
  handle?: string;
  bio?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A creator's public page: their profile by handle (or id) and the workouts they made public.
 * Only the four public columns are asked for; from 0007 other people's rows come through only
 * when they have a handle.
 */
export const fetchCreator = async (key: string): Promise<{ profile: CreatorProfile; workouts: Runsheet[] } | null> => {
  const q = sb.from('profiles').select('id,name,handle,bio');
  const { data: p } = await (UUID.test(key) ? q.eq('id', key) : q.eq('handle', key.toLowerCase())).maybeSingle();
  if (!p) return null;
  const { data: rows } = await sb.from('workouts').select('id,data,creator,title,public,owner').eq('owner', p.id).eq('public', true).order('updated_at', { ascending: false });
  return {
    profile: { id: p.id, name: p.name ?? 'Creator', handle: p.handle ?? undefined, bio: p.bio ?? undefined },
    workouts: (rows ?? []).map(r => workoutFromRow(r as WorkoutRow)),
  };
};

export const HANDLE = /^[a-z0-9][a-z0-9-]{1,29}$/;

/** Your own page's handle and bio. Needs migration 0005 (profiles.handle, profiles.bio). */
export const myProfile = async (): Promise<CreatorProfile | null> => {
  const user = currentUser();
  if (!user) return null;
  const { data } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  return data ? { id: data.id, name: data.name ?? '', handle: data.handle ?? undefined, bio: data.bio ?? undefined } : null;
};

export const saveProfile = async (patch: { handle?: string; bio?: string }): Promise<string | null> => {
  const user = currentUser();
  if (!user) return 'Sign in first.';
  if (patch.handle !== undefined && patch.handle && !HANDLE.test(patch.handle)) return 'Use 2–30 lower-case letters, numbers or dashes.';
  const { error } = await sb.from('profiles').update({ handle: patch.handle || null, bio: patch.bio ?? null }).eq('id', user.id);
  if (!error) return null;
  if (/duplicate|unique/i.test(error.message)) return 'That name is taken.';
  if (/column/i.test(error.message)) return 'Creator pages are not switched on yet (database update pending).';
  return error.message;
};

/** Fitbit / Google Health rows overlapping a session (±60 min), via the session_device RPC. */
export const deviceFor = async (r: SessionResult): Promise<{ source: string; data: Record<string, unknown> }[]> => {
  if (!currentUser()) return [];
  const { data } = await sb.rpc('session_device', { p_started: r.startedAt, p_ended: r.endedAt ?? null });
  return (data ?? []) as { source: string; data: Record<string, unknown> }[];
};

/** What an account deletion did: the data on the server, and the sign-in itself. */
export interface DeleteOutcome {
  data: boolean;
  account: boolean;
  error?: string;
}

/**
 * Delete this account's data from the server, then the account itself. The rows go first, under
 * row-level security, so the data is gone even before migration 0006 (`delete_account()`) is
 * applied; that function then removes the sign-in and the profile. Signs out either way, and
 * forgets what was last seen on the server so nothing on this device is taken for deleted there.
 */
export const deleteAccount = async (): Promise<DeleteOutcome> => {
  const user = currentUser();
  if (!user) return { data: false, account: false, error: 'Not signed in' };
  for (const table of ['sessions', 'workouts', 'exercises', 'user_state', 'device_metrics'] as const) {
    const { error } = await sb.from(table).delete().eq('owner', user.id);
    if (error) return { data: false, account: false, error: error.message };
  }
  const { error } = await sb.rpc('delete_account');
  snap = {};
  saveSnap();
  await sb.auth.signOut();
  return { data: true, account: !error, error: error?.message };
};
