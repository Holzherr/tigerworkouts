/**
 * Local-first app state: the user's own workouts, results, training maxes, saved ids.
 * One localStorage key, read once, written on every change. Cloud sync comes later.
 */
import { useCallback, useSyncExternalStore } from 'react';
import type { Runsheet } from '@/features/runsheet/model';
import type { SessionResult, TrainingMaxes } from '@/features/runsheet/progression';

export interface AppState {
  workouts: Runsheet[];
  results: SessionResult[];
  trainingMaxes: TrainingMaxes;
  bodyweightKg?: number;
  saved: string[];
  name: string;
  /** Local stand-in for auth until Supabase is ported: the landing page shows until this is true. */
  signedIn: boolean;
}

const KEY = 'workout-hub-next:v1';
const EMPTY: AppState = { workouts: [], results: [], trainingMaxes: {}, saved: [], name: 'Nick', signedIn: false };

let state: AppState = (() => {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return EMPTY;
  }
})();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export const setState = (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode */
  }
  emit();
};

export const useAppState = () => useSyncExternalStore(cb => (listeners.add(cb), () => listeners.delete(cb)), () => state);

export const useActions = () => ({
  saveWorkout: useCallback((r: Runsheet) => setState(s => ({ workouts: [r, ...s.workouts.filter(w => w.id !== r.id)] })), []),
  deleteWorkout: useCallback((id: string) => setState(s => ({ workouts: s.workouts.filter(w => w.id !== id) })), []),
  addResult: useCallback((res: SessionResult) => setState(s => ({ results: [res, ...s.results] })), []),
  setTrainingMaxes: useCallback((tm: TrainingMaxes) => setState({ trainingMaxes: tm }), []),
  setBodyweight: useCallback((kg: number) => setState({ bodyweightKg: kg }), []),
  setSignedIn: useCallback((signedIn: boolean) => setState({ signedIn }), []),
  toggleSaved: useCallback((id: string) => setState(s => ({ saved: s.saved.includes(id) ? s.saved.filter(x => x !== id) : [...s.saved, id] })), []),
});
