/**
 * Loads every imported workout under /imports at build time and hydrates exercise keys into
 * ExerciseRefs from the shared library plus the per-source new-exercises files.
 */
import { LIBRARY, type LibraryExercise } from '@/features/exercises/library';
import type { Block, ExerciseRef, ExerciseStep, Item, RestStep, Runsheet, Step } from '@/features/runsheet/model';

type RawStep = (Omit<ExerciseStep, 'exercise'> & { exercise: string | ExerciseRef }) | RestStep;
type RawBlock = Omit<Block, 'steps'> & { steps: RawStep[] };
type RawRunsheet = Omit<Runsheet, 'items'> & { items: (RawStep | RawBlock)[] };

const files = import.meta.glob<{ default: unknown }>('../../../imports/*/*.json', { eager: true });

const GROUP_ICON: Record<string, string> = { barbell: '🏋️', dumbbell: '🏋️', kettlebell: '🏋️', body: '🤸', core: '🧘', band: '🪢', treadmill: '🏃', walk: '🚶', run: '🏃', bike: '🚴', rower: '🚣', swim: '🏊', gym: '🪜' };
const extra: Record<string, LibraryExercise> = {};
const raw: { source: string; data: RawRunsheet }[] = [];
for (const [path, mod] of Object.entries(files)) {
  const [, source, file] = path.match(/imports\/([^/]+)\/([^/]+)\.json$/) ?? [];
  const data = mod.default as unknown;
  if (file === 'new-exercises') {
    for (const e of data as LibraryExercise[]) extra[e.key] = { icon: GROUP_ICON[e.group] ?? '🏋️', ...e };
  } else raw.push({ source, data: data as RawRunsheet });
}

/** Library + every exercise the imports added. */
export const FULL_LIBRARY: Record<string, LibraryExercise> = { ...extra, ...LIBRARY };

const ref = (x: string | ExerciseRef): ExerciseRef => (typeof x === 'string' ? (FULL_LIBRARY[x] ?? { key: x, name: x.replace(/^[a-z]+_/, '').replace(/_/g, ' '), unit: '', step: 1 }) : x);
const step = (s: RawStep, i: string): Step => (s.kind === 'rest' ? { ...s, id: s.id || i } : { ...s, id: s.id || i, exercise: ref(s.exercise) });
const item = (it: RawStep | RawBlock, i: number): Item => (it.kind === 'block' ? { ...it, id: it.id || `b${i}`, steps: it.steps.map((s, j) => step(s, `s${i}-${j}`)) } : step(it, `s${i}`));

export interface ImportedWorkout {
  source: string;
  runsheet: Runsheet;
}

export const IMPORTED: ImportedWorkout[] = raw
  .map(({ source, data }) => ({ source, runsheet: { ...data, items: data.items.map(item) } as Runsheet }))
  .sort((a, b) => a.source.localeCompare(b.source) || (a.runsheet.program?.order ?? 0) - (b.runsheet.program?.order ?? 0) || a.runsheet.title.localeCompare(b.runsheet.title));

export const bySource = () => {
  const out: Record<string, ImportedWorkout[]> = {};
  for (const w of IMPORTED) (out[w.source] ??= []).push(w);
  return out;
};
