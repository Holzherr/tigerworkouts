/**
 * The catalogue, loaded after first paint (review D12, 2026-11-15). `IMPORTED` and `FULL_LIBRARY`
 * read like the constants they used to be, but start small and are filled in place once the
 * catalogue chunk arrives: a component that reads them calls `useCatalogue()` (or sits under one
 * that does) to draw again when that happens.
 *
 * Before it arrives they already hold the catalogue workouts this device was asked to keep
 * (`keepOffline`: the saved ones, the run in progress, the recently done), read from localStorage.
 * So Mine draws whole at once, and a saved catalogue workout starts with no network even if the
 * chunk cannot be fetched.
 */
import { useSyncExternalStore } from 'react';
import { LIBRARY, type LibraryExercise } from '@/features/exercises/library';
import type { Runsheet } from '@/features/runsheet/model';

export interface ImportedWorkout {
  source: string;
  runsheet: Runsheet;
}
export interface CatalogueState {
  /** The whole catalogue is in `IMPORTED`. */
  ready: boolean;
  /** The last attempt to fetch it failed (offline before the service worker had it). Retried when the network returns. */
  failed: boolean;
}

/** A new key (nothing older is renamed): the catalogue workouts kept on this device, as `ImportedWorkout[]`. */
export const KEPT_KEY = 'tiger:catalogue-kept';
const KEPT_MAX = 80;

const readKept = (): ImportedWorkout[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEPT_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? (v as ImportedWorkout[]).filter(w => w && typeof w.source === 'string' && w.runsheet && Array.isArray(w.runsheet.items)) : [];
  } catch {
    return [];
  }
};

/** Every catalogue workout once loaded; until then, the kept ones. Filled in place. */
export const IMPORTED: ImportedWorkout[] = readKept();
/** Library + every exercise the imports added (those arrive with the catalogue). Filled in place. */
export const FULL_LIBRARY: Record<string, LibraryExercise> = { ...LIBRARY };

let state: CatalogueState = { ready: false, failed: false };
const listeners = new Set<() => void>();
const set = (next: CatalogueState) => {
  state = next;
  listeners.forEach(l => l());
};

let loading: Promise<void> | null = null;
/** Fetches the catalogue once; safe to call again. Resolves when it is in, or when the attempt failed. */
export const loadCatalogue = (): Promise<void> =>
  (loading ??= import('./catalogue-data').then(
    m => {
      IMPORTED.splice(0, IMPORTED.length, ...m.workouts);
      for (const k of Object.keys(FULL_LIBRARY)) delete FULL_LIBRARY[k];
      Object.assign(FULL_LIBRARY, m.library);
      set({ ready: true, failed: false });
    },
    () => {
      loading = null;
      set({ ready: false, failed: true });
      if (typeof addEventListener === 'function') addEventListener('online', () => void loadCatalogue(), { once: true });
    }
  ));

export const catalogueState = () => state;
/** Draws again when the catalogue arrives. `ready` false and `failed` false means it is on its way. */
export const useCatalogue = () => useSyncExternalStore(cb => (listeners.add(cb), () => listeners.delete(cb)), catalogueState, catalogueState);

/**
 * Keeps these catalogue workouts on the device for the next open. Called with the saved ids, the
 * run in progress and the recently done once the catalogue is in; a no-op before that, so a
 * partial list never replaces a full one.
 */
export const keepOffline = (ids: Iterable<string>) => {
  if (!state.ready) return;
  const want = new Set(ids);
  const kept = IMPORTED.filter(w => want.has(w.runsheet.id ?? w.runsheet.title)).slice(0, KEPT_MAX);
  try {
    const next = JSON.stringify(kept);
    if (localStorage.getItem(KEPT_KEY) !== next) localStorage.setItem(KEPT_KEY, next);
  } catch {
    /* private mode or full: the service worker's copy of the catalogue still covers offline */
  }
};

export const bySource = () => {
  const out: Record<string, ImportedWorkout[]> = {};
  for (const w of IMPORTED) (out[w.source] ??= []).push(w);
  return out;
};
