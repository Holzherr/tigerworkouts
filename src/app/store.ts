/**
 * Local-first app state: the user's own workouts, results, training maxes, saved ids.
 * One localStorage key, read once, written whole on every change. Synced by features/cloud.
 */
import { useSyncExternalStore } from 'react';
import type { Runsheet } from '@/features/runsheet/model';
import type { SessionResult, TrainingMaxes } from '@/features/runsheet/progression';
import type { Equipment } from '@/features/runsheet/plates';
import type { Avatar, Favorite } from '@/features/cloud/sync';
import type { LibraryExercise } from '@/features/exercises/library';
import { fromLegacySession, legacyWorkoutToRunsheet, readLegacyLocal } from '@/features/cloud/legacy';
import { stamp, type PrefField, type PrefStamps } from '@/features/cloud/prefs';
import { mergeSessions } from '@/features/runsheet/versions';
import { storedSuggest, type SuggestPrefs } from '@/features/results/suggestions';
import { setWeightUnit, unitFromPref } from '@/shared/utils/units';

export interface AppState {
  workouts: Runsheet[];
  results: SessionResult[];
  trainingMaxes: TrainingMaxes;
  bodyweightKg?: number;
  /** Settings → My equipment: the bar, plates, dumbbells and kettlebells you own. */
  equipment?: Equipment;
  /** Whether to suggest progress, and how: off / by reps, weight or effort, per account, exercise and workout. */
  suggestions?: SuggestPrefs;
  /** Bodyweight was asked for once after a workout and skipped; not asked again. */
  bodyweightAsked?: boolean;
  saved: string[];
  name: string;
  avatar?: Avatar;
  units: 'metric' | 'imperial';
  favorites: Favorite[];
  /** Exercises the user added from the picker. */
  exercises: Record<string, LibraryExercise>;
  /** Set by the landing page's Get started so the feed shows before the code arrives; real auth lives in cloud/client. */
  signedIn: boolean;
  migratedLegacy?: boolean;
  lastSync?: string;
  syncError?: string;
  /** When each pref synced on `user_state.prefs` was last changed here; the newer side wins a sync. */
  prefsUpdatedAt?: PrefStamps;
}

const KEY = 'workout-hub-next:v1';
/** The sync's record of what the server was last seen holding (cloud/sync.ts). */
const SNAP_KEY = 'tiger:synced';
/** A store that could not be read is kept here as it was found, so it can be looked at or put back. */
const UNREADABLE_KEY = 'workout-hub-next:v1:unreadable';
const EMPTY: AppState = { workouts: [], results: [], trainingMaxes: {}, saved: [], name: '', units: 'metric', favorites: [], exercises: {}, signedIn: false };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * What was on disk as a state every screen can read: each list a list, each map a map, and only
 * sessions and workouts that have what the app reads without asking (a start time and a workout
 * id; a list of items). `intact` is false when anything had to be dropped or replaced.
 */
export const readState = (raw: string | null): { state: AppState; intact: boolean } => {
  if (raw === null) return { state: EMPTY, intact: true };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: EMPTY, intact: false };
  }
  if (!isRecord(parsed)) return { state: EMPTY, intact: false };
  const out: AppState = { ...EMPTY, ...(parsed as Partial<AppState>) };
  let intact = true;
  const list = <K extends 'workouts' | 'results' | 'saved' | 'favorites'>(k: K, ok: (x: unknown) => boolean) => {
    const v: unknown = out[k];
    const kept = Array.isArray(v) ? v.filter(ok) : [];
    if (!Array.isArray(v) || kept.length !== v.length) {
      intact = false;
      out[k] = kept as AppState[K];
    }
  };
  list('results', x => isRecord(x) && typeof x.startedAt === 'string' && typeof x.runsheetId === 'string');
  list('workouts', x => isRecord(x) && Array.isArray(x.items));
  list('saved', x => typeof x === 'string');
  list('favorites', isRecord);
  for (const k of ['trainingMaxes', 'exercises'] as const)
    if (!isRecord(out[k])) {
      intact = false;
      out[k] = {};
    }
  if (typeof out.name !== 'string') out.name = '';
  if (out.units !== 'imperial') out.units = 'metric';
  return { state: out, intact };
};

/** False once a write to disk has failed (storage full, private mode), until one succeeds again. */
let persisted = true;
export const storePersisted = () => persisted;
/** Why the last write failed: the storage is full, or it cannot be written at all (private mode). */
let full = false;
const persistListeners = new Set<() => void>();
/** How often a failed write is tried again while the page stays open. */
export const RETRY_MS = 15_000;
let retry: ReturnType<typeof setInterval> | undefined;
const isQuota = (e: unknown) => e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
/** Writes of other keys that failed (the running timer's kept copy, `tiger:run`), by key: each is
 * said by the same notice and tried again with the store's own. `retry` writes again and reports
 * the outcome through `reportWrite`. */
const others = new Map<string, { retry: () => void; full: boolean }>();
/** `ok` once everything is on this device; `full` or `blocked` while what is on screen is in memory only. */
export type SaveState = 'ok' | 'full' | 'blocked';
const saveState = (): SaveState => {
  if (persisted && !others.size) return 'ok';
  return (!persisted && full) || [...others.values()].some(o => o.full) ? 'full' : 'blocked';
};
/** After any write: keep the retry running while something is not on the device, and tell the notice. */
const settle = (before: SaveState) => {
  const failing = !persisted || others.size > 0;
  if (failing && retry === undefined) retry = setInterval(retryAll, RETRY_MS);
  if (!failing && retry !== undefined) {
    clearInterval(retry);
    retry = undefined;
  }
  if (saveState() !== before) persistListeners.forEach(l => l());
};
/** The outcome of a write of another key: `error` undefined when it is on the device (or was cleared). */
export const reportWrite = (key: string, error: unknown, retry: () => void = () => {}) => {
  const before = saveState();
  if (error === undefined) others.delete(key);
  else {
    if (!others.has(key)) console.error(`[tiger] could not save ${key} to this device`, error);
    others.set(key, { retry, full: isQuota(error) });
  }
  settle(before);
};
const retryAll = () => {
  if (!persisted) write();
  for (const o of [...others.values()]) o.retry();
  return saveState() === 'ok';
};

/**
 * The sync snapshot says "the server had these rows, and so did this device". It may only be
 * believed while the store on disk is the one it was written beside: a row in the snapshot that
 * the store no longer holds reads as deleted here, and the sync deletes it on the server. So when
 * the store was unreadable, lost rows on the way in, or could not be written, the snapshot goes;
 * the next sync then pulls everything and deletes nothing.
 */
const forgetSnapshot = () => {
  try {
    localStorage.removeItem(SNAP_KEY);
  } catch {
    /* no storage */
  }
};

let state: AppState = (() => {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  const read = readState(raw);
  // No store beside a snapshot is the same doubt: something removed one key and not the other.
  if (!read.intact || raw === null) forgetSnapshot();
  if (!read.intact && raw !== null) {
    console.error('[tiger] the saved state could not be read as written; kept under', UNREADABLE_KEY);
    try {
      localStorage.setItem(UNREADABLE_KEY, raw);
    } catch {
      /* no room for a second copy */
    }
  }
  return read.state;
})();

// One-off: pick up what the v0.9 app left in this origin's localStorage (same domain after the cutover).
if (!state.migratedLegacy) {
  const legacy = readLegacyLocal();
  if (legacy) {
    const results = (legacy.sessions ?? []).map(fromLegacySession);
    const workouts = (legacy.workouts ?? []).map(legacyWorkoutToRunsheet);
    state = {
      ...state,
      results: [...results.filter(r => !state.results.some(x => x.id === r.id)), ...state.results].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      workouts: [...workouts.filter(w => !state.workouts.some(x => x.id === w.id)), ...state.workouts],
      favorites: state.favorites.length ? state.favorites : (legacy.favorites ?? []),
      saved: [...new Set([...state.saved, ...(legacy.saved ?? [])])],
      name: legacy.name || state.name,
      avatar: state.avatar ?? (legacy.avatar as Avatar | undefined),
      signedIn: state.signedIn || results.length > 0,
      migratedLegacy: true,
    };
  } else state = { ...state, migratedLegacy: true };
}
const listeners = new Set<() => void>();
// Loads are shown in the unit the synced `units` pref says (U11); kept beside the store for the
// formatting helpers, which run outside React.
setWeightUnit(unitFromPref(state.units));
const emit = () => {
  setWeightUnit(unitFromPref(state.units));
  listeners.forEach(l => l());
};

export const setState = (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => {
  const next = typeof patch === 'function' ? patch(state) : patch;
  // A write that changes nothing must not notify: subscribers re-render, and an effect that
  // re-sets a value it already holds would otherwise loop until React gives up (#185).
  const keys = Object.keys(next) as (keyof AppState)[];
  if (keys.every(k => Object.is(state[k], next[k]))) return;
  state = { ...state, ...next };
  write();
  emit();
};

/**
 * Writes the whole state to this device. A failed write is said (`useSaveState`, the notice in
 * app/storage-notice.tsx) and tried again every `RETRY_MS`, when the page is hidden and on every
 * later change: the session stays in memory, and so in the next sync, until one gets through.
 */
const write = () => {
  const before = saveState();
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    persisted = true;
  } catch (e) {
    // Private mode, or the storage is full. What is on disk is now older than what is on screen.
    if (persisted) console.error('[tiger] could not save to this device', e);
    persisted = false;
    full = isQuota(e);
    forgetSnapshot();
  }
  settle(before);
  return persisted;
};
/** Try the failed writes again now. True when what is on screen is on this device. */
export const retrySave = () => saveState() === 'ok' || retryAll();
export const useSaveState = () => useSyncExternalStore(cb => (persistListeners.add(cb), () => void persistListeners.delete(cb)), saveState);

if (typeof window !== 'undefined') {
  // The last chance before the page goes: a tab closed, the phone locked.
  const last = () => void retrySave();
  window.addEventListener('pagehide', last);
  document.addEventListener('visibilitychange', () => document.hidden && last());
  // Closing the tab now would lose what is only in memory: the browser asks first.
  window.addEventListener('beforeunload', e => {
    if (saveState() !== 'ok') e.preventDefault();
  });
}

// Another tab wrote the store. Each tab holds the whole state and writes all of it, so without
// this a tab opened earlier wrote its older copy back over a session logged in the other one.
if (typeof window !== 'undefined')
  window.addEventListener('storage', e => {
    if (e.key !== KEY || !e.newValue) return;
    const read = readState(e.newValue);
    // A write this tab cannot read is not taken: what it holds stays.
    if (!read.intact) return;
    state = read.state;
    emit();
  });

export const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

export const useAppState = () => useSyncExternalStore(subscribe, () => state);
/** The store now, outside React: for work that spans an await, like a sync. */
export const getState = () => state;

/** A change to synced prefs, stamped so the sync can tell it is newer than the other device's.
 * A write that changes nothing is not stamped. */
const setPrefs = (patch: Partial<AppState>) =>
  setState(s => {
    const moved = (Object.keys(patch) as PrefField[]).filter(k => JSON.stringify(s[k as keyof AppState] ?? null) !== JSON.stringify(patch[k as keyof AppState] ?? null));
    if (!moved.length) return {};
    const t = stamp();
    return { ...patch, prefsUpdatedAt: { ...s.prefsUpdatedAt, ...Object.fromEntries(moved.map(k => [k, t])) } };
  });

/** Everything on this device forgotten: after a sign-out, or an account deleted with "clear this device". */
export const clearDevice = () => {
  // The kept run, its origin and the open result sheet are the last person's too: left behind,
  // the next account on this browser was offered "Save what I did" for their session.
  try {
    for (const k of ['tiger:run', 'tiger:run-from', 'tiger:pending']) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
  clearState();
};
const clearState = () => setState({ ...EMPTY, migratedLegacy: true, prefsUpdatedAt: {}, bodyweightKg: undefined, bodyweightAsked: undefined, equipment: undefined, suggestions: undefined, avatar: undefined, lastSync: undefined, syncError: undefined });

const ACTIONS = {
  saveWorkout: (r: Runsheet) => setState(s => ({ workouts: [r, ...s.workouts.filter(w => w.id !== r.id)] })),
  deleteWorkout: (id: string) => setState(s => ({ workouts: s.workouts.filter(w => w.id !== id) })),
  /** A duplicate folded into another workout as a version: its sessions move to that workout, each
   * keeping what it ran, and the duplicate goes (versions.ts). Bookmarked, the base takes its place. */
  mergeWorkout: (fromId: string, intoId: string) => {
    const from = state.workouts.find(w => w.id === fromId);
    const into = state.workouts.find(w => w.id === intoId);
    if (!from || !into || fromId === intoId) return;
    setState(s => ({ results: mergeSessions(s.results, from, into), workouts: s.workouts.filter(w => w.id !== fromId) }));
    if (state.saved.includes(fromId)) setPrefs({ saved: [...new Set(state.saved.map(x => (x === fromId ? intoId : x)))] });
  },
  /** Adds, or replaces the result with the same id: a timed session is logged when it ends and
   * again, with the score and notes, when its result sheet is saved. */
  addResult: (res: SessionResult) => setState(s => {
    const id = res.id ?? 's-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    return { results: [{ ...res, id }, ...s.results.filter(r => r.id !== id)] };
  }),
  setTrainingMaxes: (tm: TrainingMaxes) => setPrefs({ trainingMaxes: tm }),
  /** An empty kit clears it: suggested loads go back to the defaults. */
  setEquipment: (equipment: Equipment | undefined) => setPrefs({ equipment: equipment && Object.values(equipment).some(v => (Array.isArray(v) ? v.length : v !== undefined)) ? equipment : undefined }),
  /** The default (on, by reps, nothing else set) clears the field. */
  setSuggestions: (p: SuggestPrefs | undefined) => setPrefs({ suggestions: storedSuggest(p) }),
  setBodyweight: (kg: number) => (setPrefs({ bodyweightKg: kg }), setState({ bodyweightAsked: true })),
  skipBodyweight: () => setState({ bodyweightAsked: true }),
  setSignedIn: (signedIn: boolean) => setState({ signedIn }),
  updateResult: (id: string, patch: Partial<SessionResult>) => setState(s => ({ results: s.results.map(r => (r.id === id ? { ...r, ...patch } : r)) })),
  deleteResult: (id: string) => setState(s => ({ results: s.results.filter(r => r.id !== id) })),
  setProfile: (p: Partial<Pick<AppState, 'name' | 'avatar' | 'units'>>) => setPrefs(p),
  setFavorites: (favorites: Favorite[]) => setState({ favorites }),
  addExercise: (e: LibraryExercise) => setState(s => ({ exercises: { ...s.exercises, [e.key]: e } })),
  /** A CSV import: its sessions into History and the exercises it had to create into the library. */
  importSessions: (results: SessionResult[], exercises: LibraryExercise[]) =>
    setState(s => ({
      exercises: { ...s.exercises, ...Object.fromEntries(exercises.map(e => [e.key, e])) },
      results: [...results.filter(r => !s.results.some(x => x.id === r.id)), ...s.results].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    })),
  clearDevice,
  toggleSaved: (id: string) => setPrefs({ saved: state.saved.includes(id) ? state.saved.filter(x => x !== id) : [...state.saved, id] }),
};

/** One frozen object for the life of the app, so it is safe in an effect's dependency list. */
export const useActions = () => ACTIONS;
