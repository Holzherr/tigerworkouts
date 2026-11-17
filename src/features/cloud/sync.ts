/**
 * Three-way sync between the local store and Supabase. `snap` remembers a hash of each row as last
 * seen on the server, so local edits, server edits and deletes on either side are told apart:
 *   local changed, server same   → push
 *   server changed, local same   → pull (server wins)
 *   missing on server, unchanged → deleted there, drop locally
 *   missing locally, in snapshot → deleted here, delete there
 * Rows the v0.9 app wrote are converted on the way in and preserved on the way out.
 */
import { storePersisted } from '@/app/store';
import { accountPageWorkouts } from '@/features/creators/credited';
import type { Runsheet } from '@/features/runsheet/model';
import type { LibraryExercise } from '@/features/exercises/library';
import type { SessionResult, TrainingMaxes } from '@/features/runsheet/progression';
import type { Equipment } from '@/features/runsheet/plates';
import { currentUser, sb } from './client';
import type { LegacySession } from './legacy';
import { mergePrefs, prefsRow, remoteSide, type PrefStamps } from './prefs';
import { readSuggest, storedSuggest, type SuggestPrefs } from '@/features/results/suggestions';
import { fromRow, readableWorkout, readableWorkouts, workoutFromRow, type WorkoutRow } from './rows';

export { fromRow, workoutFromRow, type WorkoutRow } from './rows';

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
  /** Whether to suggest progress, and how (`prefs.suggestions`, shared with the iPhone app). */
  suggestions?: SuggestPrefs;
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
const PAGE = 1000;

/**
 * The snapshot keeps a hash of each row as last seen on the server, not the row (review A2): it only
 * ever answers "is this the same as then", and a full copy of every session beside the store filled
 * localStorage at around a thousand sessions. A hash is the row's JSON length and a 53-bit hash of
 * it (cyrb53).
 *
 * Stored as `[2, {id: hash}]`. Before 17 Nov 2026 it was `{id: rowJSON}`, which is read once and
 * hashed value by value, so nothing is pushed or pulled that would not have been. The new form is
 * a list on purpose: an older build still open in another tab reads it as an empty snapshot (as on
 * a fresh device: take the server's rows, push only what the server lacks) and its own writes of a
 * list drop what it added, so it can neither overwrite newer work nor clobber this snapshot.
 */
const hash = (s: string) => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${s.length.toString(36)}.${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
};
const H = (o: unknown) => hash(JSON.stringify(o));
const SNAP_FORMAT = 2;

/** The snapshot as stored, either form; anything else reads as empty. */
export const readSnap = (raw: string | null): Record<string, string> => {
  let v: unknown;
  try {
    v = JSON.parse(raw || '{}');
  } catch {
    return {};
  }
  const isObj = (o: unknown): o is Record<string, unknown> => typeof o === 'object' && o !== null && !Array.isArray(o);
  if (Array.isArray(v)) return v[0] === SNAP_FORMAT && isObj(v[1]) ? Object.fromEntries(Object.entries(v[1]).filter((e): e is [string, string] => typeof e[1] === 'string')) : {};
  if (!isObj(v)) return {};
  // The old form: each value is the row's JSON as it was compared, so its hash stands in for it.
  return Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string').map(([k, j]) => [k, hash(j)]));
};
export const writeSnap = (s: Record<string, string>) => JSON.stringify([SNAP_FORMAT, s]);

let snap: Record<string, string> = readSnap(typeof localStorage === 'undefined' ? null : localStorage.getItem(SNAP_KEY));
// Another tab's sync moved the snapshot on: this tab must reason from the same one, or its next
// sync reads rows that tab pushed as "seen, and gone from here" and deletes them on the server.
if (typeof window !== 'undefined')
  window.addEventListener('storage', e => {
    if (e.key !== SNAP_KEY) return;
    snap = readSnap(e.newValue);
  });
const saveSnap = () => {
  try {
    // Never on disk ahead of the store: a snapshot beside an older store reads the rows that
    // store lacks as deleted here (store.ts, forgetSnapshot).
    if (storePersisted()) localStorage.setItem(SNAP_KEY, writeSnap(snap));
    else localStorage.removeItem(SNAP_KEY);
  } catch {
    /* ignore */
  }
};
const J = (o: unknown) => JSON.stringify(o);

const resultId = (r: SessionResult) => r.id ?? `${r.runsheetId}@${r.startedAt}`;
/** Sign-out: forget what the server was last seen holding, in memory and on disk, so the next
 * account's first sync on this device neither pushes nor deletes anything of the last one's. */
export const clearSnap = () => {
  snap = {};
  localStorage.removeItem(SNAP_KEY);
};
/** How many results and workouts the server has not seen in this form: what the next sync would push. */
export const dirtyCount = (local: Pick<SyncTarget, 'results' | 'workouts'>) => local.results.filter(x => H(x) !== snap[resultId(x)]).length + local.workouts.filter(w => w.id && H(w) !== snap[`w:${w.id}`]).length;
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

let turn: Promise<unknown> = Promise.resolve();
/**
 * Syncs and sign-out share `snap`, so they run one at a time: `fn` starts once every earlier turn
 * has settled. A sync queued behind a sign-out reads `currentUser()` when its turn comes and finds
 * nobody; one already out when sign-out starts finishes, and its patch is applied, before the
 * device is cleared. Sign-out holds the turn from its own sync through `clearSnap()`.
 */
export const inTurn = <T>(fn: () => Promise<T>): Promise<T> => {
  const mine = turn.then(fn, fn);
  turn = mine.catch(() => {});
  return mine;
};

/** Pull then push. Returns what changed locally so the store can apply it. */
export const sync = (local: SyncTarget): Promise<SyncResult> => inTurn(() => pullPush(local));

/** The sync itself, for whoever already holds the turn (sign-out). */
export const pullPush = async (local: SyncTarget): Promise<SyncResult> => {
  const user = currentUser();
  if (!user) return { patch: {}, changed: false };
  const uid = user.id;
  const patch: Partial<SyncTarget> = {};
  const errors: string[] = [];
  let changed = false;

  // ── sessions ──
  let results = local.results.map(ensureId);
  // Paged: the server caps a select (1000 rows by default), and a row missing from the answer is
  // read below as deleted on the server.
  const rows: { id: string; data: unknown }[] = [];
  let e1: { message: string } | null = null;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('sessions').select('id,data').eq('owner', uid).order('id').range(from, from + PAGE - 1);
    if (error) {
      e1 = error;
      break;
    }
    rows.push(...((data ?? []) as { id: string; data: unknown }[]));
    if ((data ?? []).length < PAGE) break;
  }
  if (e1) errors.push(e1.message);
  else {
    const remote = new Map(rows.map(r => [r.id, fromRow(r)]));
    const remoteJ = new Map([...remote].map(([id, r]) => [id, H(r)]));
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
      const lj = H(results[i]);
      if (!(id in snap) || (rj !== snap[id] && lj === snap[id])) {
        results = results.map((x, k) => (k === i ? r : x));
        snap[id] = rj;
        changed = true;
      }
    });
    const before = results.length;
    results = results.filter(x => {
      const id = resultId(x);
      if (!remote.has(id) && id in snap && H(x) === snap[id]) {
        delete snap[id];
        return false;
      }
      return true;
    });
    if (results.length !== before) changed = true;
    // push
    const dirty = results.filter(x => H(x) !== snap[resultId(x)]);
    if (dirty.length) {
      const { error } = await sb.from('sessions').upsert(dirty.map(x => toRow(x, uid)), { onConflict: 'id' });
      if (!error) dirty.forEach(x => (snap[resultId(x)] = H(x)));
      else if (dirty.length === 1) errors.push(error.message);
      else {
        // One row the server refuses fails the whole batch. Sent one by one, the rest still land:
        // a refused import must not keep every later gym session off the account.
        for (const x of dirty) {
          const { error: e } = await sb.from('sessions').upsert([toRow(x, uid)], { onConflict: 'id' });
          if (e) errors.push(e.message);
          else snap[resultId(x)] = H(x);
        }
      }
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
      const rj = H(w);
      const i = workouts.findIndex(x => x.id === id);
      if (i < 0) {
        if (!(k in snap)) {
          workouts = [...workouts, w];
          snap[k] = rj;
          changed = true;
        }
        return;
      }
      const lj = H(workouts[i]);
      if (!(k in snap) || (rj !== snap[k] && lj === snap[k])) {
        workouts = workouts.map((x, j) => (j === i ? w : x));
        snap[k] = rj;
        changed = true;
      }
    });
    const before = workouts.length;
    workouts = workouts.filter(w => {
      const k = `w:${w.id}`;
      if (!remote.has(w.id!) && k in snap && H(w) === snap[k]) {
        delete snap[k];
        return false;
      }
      return true;
    });
    if (workouts.length !== before) changed = true;
    const dirty = workouts.filter(w => w.id && H(w) !== snap[`w:${w.id}`]);
    if (dirty.length) {
      const row = (w: Runsheet) => ({ id: w.id!, owner: uid, creator: w.creator ?? local.name, title: w.title, public: w.public ?? remote.get(w.id!)?.public ?? false, data: workoutData(w) });
      const { error } = await sb.from('workouts').upsert(dirty.map(row), { onConflict: 'id' });
      if (!error) dirty.forEach(w => (snap[`w:${w.id}`] = H(w)));
      else if (dirty.length === 1) errors.push(error.message);
      else {
        // As for sessions: one workout the server refuses (an id another account holds, a public
        // one on a temporary account) must not keep the others off the account.
        for (const w of dirty) {
          const { error: e } = await sb.from('workouts').upsert([row(w)], { onConflict: 'id' });
          if (e) errors.push(e.message);
          else snap[`w:${w.id}`] = H(w);
        }
      }
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
      { values: { saved: local.saved, trainingMaxes: local.trainingMaxes, bodyweightKg: local.bodyweightKg, equipment: local.equipment, name: local.name, avatar: local.avatar, units: local.units, suggestions: storedSuggest(local.suggestions) }, updatedAt: local.prefsUpdatedAt ?? {} },
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
      suggestions: storedSuggest(readSuggest(v.suggestions)),
      name: (v.name as string | undefined) ?? local.name,
      avatar: v.avatar as Avatar | undefined,
      units: (v.units as SyncTarget['units'] | undefined) ?? 'metric',
      prefsUpdatedAt: m.updatedAt,
    };
    const mine = { favorites: local.favorites, saved: local.saved, trainingMaxes: local.trainingMaxes, bodyweightKg: local.bodyweightKg, equipment: local.equipment, name: local.name, avatar: local.avatar, units: local.units, suggestions: storedSuggest(local.suggestions), prefsUpdatedAt: local.prefsUpdatedAt ?? {} };
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
  return readableWorkouts((data ?? []).filter(r => r.owner !== me) as WorkoutRow[]);
};

/** One workout by id, for a `#/w/` link opened cold; null when RLS hides it (private, not yours) or it does not exist. */
export const fetchWorkout = async (id: string): Promise<Runsheet | null> => {
  const { data, error } = await sb.from('workouts').select('id,owner,creator,title,public,data').eq('id', id).maybeSingle();
  // No answer is not "no row": the caller tells "could not load" from "private".
  if (error && !data) throw new Error(error.message);
  // Your own row is read as it is; anyone else's has to be a workout the page can draw.
  if (data) return data.owner === currentUser()?.id ? workoutFromRow(data as WorkoutRow) : readableWorkout(data as WorkoutRow);
  // Not listed for this caller: a workout shared by link (review round 2, U4) opens through
  // shared_workout(id) only (migration 0016; until it has run, the call fails and reads as private).
  const shared = await sb.rpc('shared_workout', { p_id: id });
  if (shared.error) {
    if (shared.status === 0) throw new Error(shared.error.message);
    return null;
  }
  const row = (shared.data as WorkoutRow[] | null)?.[0];
  return row ? readableWorkout(row) : null;
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
  const { data: p, error } = await (UUID.test(key) ? q.eq('id', key) : q.eq('handle', key.toLowerCase())).maybeSingle();
  // No answer from the server is not "no such creator": the page says it could not load.
  if (error) throw new Error(error.message);
  if (!p) return null;
  const { data: rows } = await sb.from('workouts').select('id,data,creator,title,public,owner').eq('owner', p.id).eq('public', true).order('updated_at', { ascending: false });
  return {
    profile: { id: p.id, name: p.name ?? 'Creator', handle: p.handle ?? undefined, bio: p.bio ?? undefined },
    // What an admin adapted from a creator's post lives on that creator's page (#/by/), not the admin's.
    workouts: accountPageWorkouts(readableWorkouts((rows ?? []) as WorkoutRow[])),
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
