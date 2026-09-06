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
import type { SessionResult, TrainingMaxes } from '@/features/runsheet/progression';
import { currentUser, sb } from './client';
import { fromLegacySession, isLegacySession, legacyWorkoutToRunsheet, type LegacySession } from './legacy';

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

const workoutFromRow = (row: { id: string; data: unknown; creator?: string | null; title?: string | null }): Runsheet => {
  const d = row.data as Record<string, unknown>;
  if (d && Array.isArray(d.items)) return { ...(d as unknown as Runsheet), id: row.id };
  return legacyWorkoutToRunsheet({ id: row.id, title: String(row.title ?? d?.title ?? row.id), creator: row.creator ?? undefined, blocks: (d?.blocks as never) ?? [] });
};

export interface SyncResult {
  patch: Partial<SyncTarget>;
  error?: string;
  changed: boolean;
}

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
  const { data: wrows, error: e2 } = await sb.from('workouts').select('id,data,creator,title').eq('owner', uid);
  if (e2) errors.push(e2.message);
  else {
    let workouts = [...local.workouts];
    const remote = new Map((wrows ?? []).map(r => [r.id as string, workoutFromRow(r as { id: string; data: unknown; creator?: string | null; title?: string | null })]));
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
      const { error } = await sb.from('workouts').upsert(dirty.map(w => ({ id: w.id!, owner: uid, creator: w.creator ?? local.name, title: w.title, public: true, data: w })), { onConflict: 'id' });
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

  // ── user state: last writer wins, server fills blanks ──
  const { data: st } = await sb.from('user_state').select('favorites,prefs').eq('owner', uid).maybeSingle();
  const prefs = (st?.prefs ?? {}) as Partial<{ name: string; saved: string[]; avatar: Avatar; units: 'metric' | 'imperial'; trainingMaxes: TrainingMaxes; bodyweightKg: number }>;
  const merged = {
    favorites: local.favorites.length ? local.favorites : ((st?.favorites as Favorite[] | null) ?? []),
    saved: [...new Set([...(prefs.saved ?? []), ...local.saved])],
    name: local.name && local.name !== 'Nick' ? local.name : (prefs.name ?? local.name),
    avatar: local.avatar ?? prefs.avatar,
    units: local.units ?? prefs.units ?? 'metric',
    trainingMaxes: { ...(prefs.trainingMaxes ?? {}), ...local.trainingMaxes },
    bodyweightKg: local.bodyweightKg ?? prefs.bodyweightKg,
  };
  Object.assign(patch, merged);
  if (J(merged) !== snap['state']) {
    const { error } = await sb.from('user_state').upsert({ owner: uid, favorites: merged.favorites, prefs: { name: merged.name, saved: merged.saved, avatar: merged.avatar, units: merged.units, trainingMaxes: merged.trainingMaxes, bodyweightKg: merged.bodyweightKg } }, { onConflict: 'owner' });
    if (error) errors.push(error.message);
    else snap['state'] = J(merged);
    await sb.from('profiles').update({ name: merged.name, units: merged.units }).eq('id', uid);
    changed = true;
  }
  saveSnap();
  return { patch, changed, error: errors[0] };
};

/** Public workouts other people made (creators), for Discover. */
export const fetchPublicWorkouts = async (): Promise<Runsheet[]> => {
  const { data } = await sb.from('workouts').select('id,data,creator,title,owner').eq('public', true);
  const me = currentUser()?.id;
  return (data ?? []).filter(r => r.owner !== me).map(r => workoutFromRow(r as { id: string; data: unknown; creator?: string | null; title?: string | null }));
};

/** Fitbit / Google Health rows overlapping a session (±60 min), via the session_device RPC. */
export const deviceFor = async (r: SessionResult): Promise<{ source: string; data: Record<string, unknown> }[]> => {
  if (!currentUser()) return [];
  const { data } = await sb.rpc('session_device', { p_started: r.startedAt, p_ended: r.endedAt ?? null });
  return (data ?? []) as { source: string; data: Record<string, unknown> }[];
};
