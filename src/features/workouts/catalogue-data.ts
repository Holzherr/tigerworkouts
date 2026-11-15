/**
 * The catalogue itself: every workout under /imports, hydrated. About half the app by weight, so
 * nothing imports this file directly: `catalogue.ts` loads it after first paint.
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
export const library: Record<string, LibraryExercise> = { ...extra, ...LIBRARY };

export const workouts: { source: string; runsheet: Runsheet }[] = raw
  .map(({ source, data }) => ({ source, runsheet: hydrate(data, library) }))
  .sort((a, b) => a.source.localeCompare(b.source) || (a.runsheet.program?.order ?? 0) - (b.runsheet.program?.order ?? 0) || a.runsheet.title.localeCompare(b.runsheet.title));
