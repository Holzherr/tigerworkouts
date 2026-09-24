/**
 * The public catalogue, the same one the web app bundles: imports/ (via scripts/catalogue.mjs)
 * hydrated with the app's own hydrate() and exercise library.
 */
import { LIBRARY, type LibraryExercise } from '@/features/exercises/library';
import type { ExerciseRef, Runsheet } from '@/features/runsheet/model';
import { hydrate, withIcons, type RawRunsheet } from '@/features/workouts/hydrate';
import data from './generated/catalogue.json';

const raw = data as unknown as { extra: LibraryExercise[]; workouts: { source: string; data: RawRunsheet }[] };

export const FULL_LIBRARY: Record<string, LibraryExercise> = { ...withIcons(raw.extra), ...LIBRARY };

export interface CatalogueWorkout {
  source: string;
  runsheet: Runsheet;
}
let cache: CatalogueWorkout[] | null = null;
export const catalogue = (): CatalogueWorkout[] => (cache ??= raw.workouts.map(w => ({ source: w.source, runsheet: hydrate(w.data, FULL_LIBRARY) })));

export const libraryRef = (key: string): ExerciseRef | undefined => FULL_LIBRARY[key];
