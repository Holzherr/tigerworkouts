/**
 * Local-first app state: the user's own workouts, results, training maxes, saved ids.
 * One localStorage key, read once, written on every change. Cloud sync comes later.
 */
import { useSyncExternalStore } from 'react';
import type { Runsheet } from '@/features/runsheet/model';
import type { SessionResult, TrainingMaxes } from '@/features/runsheet/progression';
import type { Equipment } from '@/features/runsheet/plates';
import type { Avatar, Favorite } from '@/features/cloud/sync';
import type { LibraryExercise } from '@/features/exercises/library';
import { fromLegacySession, legacyWorkoutToRunsheet, readLegacyLocal } from '@/features/cloud/legacy';
import { stamp, type PrefField, type PrefStamps } from '@/features/cloud/prefs';

export interface AppState {
  workouts: Runsheet[];
  results: SessionResult[];
  trainingMaxes: TrainingMaxes;
  bodyweightKg?: number;
  /** Settings → My equipment: the bar, plates, dumbbells and kettlebells you own. */
  equipment?: Equipment;
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
const EMPTY: AppState = { workouts: [], results: [], trainingMaxes: {}, saved: [], name: 'Nick', units: 'metric', favorites: [], exercises: {}, signedIn: false };

let state: AppState = (() => {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return EMPTY;
  }
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
const emit = () => listeners.forEach(l => l());

export const setState = (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => {
  const next = typeof patch === 'function' ? patch(state) : patch;
  // A write that changes nothing must not notify: subscribers re-render, and an effect that
  // re-sets a value it already holds would otherwise loop until React gives up (#185).
  const keys = Object.keys(next) as (keyof AppState)[];
  if (keys.every(k => Object.is(state[k], next[k]))) return;
  state = { ...state, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode */
  }
  emit();
};

export const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

export const useAppState = () => useSyncExternalStore(subscribe, () => state);

/** A change to synced prefs, stamped so the sync can tell it is newer than the other device's.
 * A write that changes nothing is not stamped. */
const setPrefs = (patch: Partial<AppState>) =>
  setState(s => {
    const moved = (Object.keys(patch) as PrefField[]).filter(k => JSON.stringify(s[k as keyof AppState] ?? null) !== JSON.stringify(patch[k as keyof AppState] ?? null));
    if (!moved.length) return {};
    const t = stamp();
    return { ...patch, prefsUpdatedAt: { ...s.prefsUpdatedAt, ...Object.fromEntries(moved.map(k => [k, t])) } };
  });

const ACTIONS = {
  saveWorkout: (r: Runsheet) => setState(s => ({ workouts: [r, ...s.workouts.filter(w => w.id !== r.id)] })),
  deleteWorkout: (id: string) => setState(s => ({ workouts: s.workouts.filter(w => w.id !== id) })),
  /** Adds, or replaces the result with the same id: a timed session is logged when it ends and
   * again, with the score and notes, when its result sheet is saved. */
  addResult: (res: SessionResult) => setState(s => {
    const id = res.id ?? 's-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    return { results: [{ ...res, id }, ...s.results.filter(r => r.id !== id)] };
  }),
  setTrainingMaxes: (tm: TrainingMaxes) => setPrefs({ trainingMaxes: tm }),
  /** An empty kit clears it: suggested loads go back to the defaults. */
  setEquipment: (equipment: Equipment | undefined) => setPrefs({ equipment: equipment && Object.values(equipment).some(v => (Array.isArray(v) ? v.length : v !== undefined)) ? equipment : undefined }),
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
  /** Everything on this device forgotten: after an account is deleted with "clear this device". */
  clearDevice: () => setState({ ...EMPTY, migratedLegacy: true, prefsUpdatedAt: {}, bodyweightKg: undefined, bodyweightAsked: undefined, equipment: undefined, avatar: undefined, lastSync: undefined, syncError: undefined }),
  toggleSaved: (id: string) => setPrefs({ saved: state.saved.includes(id) ? state.saved.filter(x => x !== id) : [...state.saved, id] }),
};

/** One frozen object for the life of the app, so it is safe in an effect's dependency list. */
export const useActions = () => ACTIONS;
