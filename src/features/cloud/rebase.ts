import type { SessionResult } from '@/features/runsheet/progression';
import type { SyncTarget } from './sync';

const J = (o: unknown) => JSON.stringify(o);
const resultId = (r: SessionResult) => r.id ?? `${r.runsheetId}@${r.startedAt}`;
const workoutId = (w: { id?: string; title: string }) => w.id ?? w.title;

/** A list the sync returned, replayed over what changed on this device while it was out: an item
 * added or edited since the snapshot wins, one deleted since stays deleted. */
const mergeList = <T,>(current: T[], snapshot: T[], synced: T[], id: (x: T) => string): T[] => {
  const before = new Map(snapshot.map(x => [id(x), x]));
  const now = new Map(current.map(x => [id(x), x]));
  const out = synced.filter(x => !(before.has(id(x)) && !now.has(id(x))));
  for (const x of current) {
    const was = before.get(id(x));
    if (was && J(was) === J(x)) continue;
    const at = out.findIndex(y => id(y) === id(x));
    if (at >= 0) out[at] = x;
    else out.unshift(x);
  }
  return out;
};

const mergeRecord = <T,>(current: Record<string, T>, snapshot: Record<string, T>, synced: Record<string, T>): Record<string, T> => {
  const out = { ...synced };
  for (const k of Object.keys(snapshot)) if (!(k in current)) delete out[k];
  for (const [k, v] of Object.entries(current)) if (J(snapshot[k]) !== J(v)) out[k] = v;
  return out;
};

/**
 * Apply a sync's result to the store as it is now, not as it was when the sync began. The sync
 * takes a snapshot, talks to the server for a second or more, and hands back a patch; applied
 * wholesale, that patch undid anything written in between — a workout that finished during a
 * sync vanished, and a Discard came back. What changed locally since the snapshot wins here, and
 * the next run pushes it.
 */
export const rebase = (current: SyncTarget, snapshot: SyncTarget, patch: Partial<SyncTarget>): Partial<SyncTarget> => {
  const out: Partial<SyncTarget> = {};
  for (const key of Object.keys(patch) as (keyof SyncTarget)[]) {
    const synced = patch[key];
    if (key === 'results') out.results = mergeList(current.results, snapshot.results, synced as SessionResult[], resultId);
    else if (key === 'workouts') out.workouts = mergeList(current.workouts, snapshot.workouts, synced as SyncTarget['workouts'], workoutId);
    else if (key === 'exercises') out.exercises = mergeRecord(current.exercises ?? {}, snapshot.exercises ?? {}, (synced as SyncTarget['exercises']) ?? {});
    else if (key === 'prefsUpdatedAt') {
      // Per field, the later stamp: a pref changed during the sync keeps its own.
      const stamps: Record<string, string> = { ...(synced as SyncTarget['prefsUpdatedAt']) };
      for (const [k, t] of Object.entries(current.prefsUpdatedAt ?? {})) if (t && (!stamps[k] || t > stamps[k])) stamps[k] = t;
      out.prefsUpdatedAt = stamps as SyncTarget['prefsUpdatedAt'];
    } else if (J(current[key]) !== J(snapshot[key])) continue;
    else (out as Record<string, unknown>)[key] = synced;
  }
  return out;
};
