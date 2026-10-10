/**
 * Loads every imported workout under /imports at build time and hydrates exercise keys into
 * ExerciseRefs from the shared library plus the per-source new-exercises files.
 */
import { LIBRARY, type LibraryExercise } from '@/features/exercises/library';
import type { Runsheet } from '@/features/runsheet/model';
import { hydrate, withIcons, type RawRunsheet } from './hydrate';

const files = import.meta.glob<{ default: unknown }>('../../../imports/*/*.json', { eager: true });

let extra: Record<string, LibraryExercise> = {};
const raw: { source: string; data: RawRunsheet }[] = [];
for (const [path, mod] of Object.entries(files)) {
  const [, source, file] = path.match(/imports\/([^/]+)\/([^/]+)\.json$/) ?? [];
  const data = mod.default as unknown;
  if (file === 'new-exercises') extra = { ...extra, ...withIcons(data as LibraryExercise[]) };
  else raw.push({ source, data: data as RawRunsheet });
}

/** Library + every exercise the imports added. */
export const FULL_LIBRARY: Record<string, LibraryExercise> = { ...extra, ...LIBRARY };

export interface ImportedWorkout {
  source: string;
  runsheet: Runsheet;
}

export const IMPORTED: ImportedWorkout[] = raw
  .map(({ source, data }) => ({ source, runsheet: hydrate(data, FULL_LIBRARY) }))
  .sort((a, b) => a.source.localeCompare(b.source) || (a.runsheet.program?.order ?? 0) - (b.runsheet.program?.order ?? 0) || a.runsheet.title.localeCompare(b.runsheet.title));

export const bySource = () => {
  const out: Record<string, ImportedWorkout[]> = {};
  for (const w of IMPORTED) (out[w.source] ??= []).push(w);
  return out;
};
