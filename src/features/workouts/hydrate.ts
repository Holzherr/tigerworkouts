/**
 * Turns a raw catalogue file from /imports (exercise keys instead of full ExerciseRefs, ids
 * optional) into a Runsheet. Pure and free of Vite-only APIs, so the web app (imported.ts) and the
 * MCP worker (mcp/) hydrate the catalogue the same way.
 */
import type { LibraryExercise } from '@/features/exercises/library';
import type { Block, ExerciseRef, ExerciseStep, Item, RestStep, Runsheet, Step } from '@/features/runsheet/model';

export type RawStep = (Omit<ExerciseStep, 'exercise'> & { exercise: string | ExerciseRef }) | RestStep;
export type RawBlock = Omit<Block, 'steps'> & { steps: RawStep[] };
export type RawRunsheet = Omit<Runsheet, 'items'> & { items: (RawStep | RawBlock)[] };

export const GROUP_ICON: Record<string, string> = { barbell: '🏋️', dumbbell: '🏋️', kettlebell: '🏋️', body: '🤸', core: '🧘', band: '🪢', treadmill: '🏃', walk: '🚶', run: '🏃', bike: '🚴', rower: '🚣', swim: '🏊', gym: '🪜' };

/** The exercises a source's new-exercises.json adds, with the group icon filled in. */
export const withIcons = (list: LibraryExercise[]): Record<string, LibraryExercise> => Object.fromEntries(list.map(e => [e.key, { icon: GROUP_ICON[e.group] ?? '🏋️', ...e }]));

export const hydrate = (data: RawRunsheet, library: Record<string, LibraryExercise>): Runsheet => {
  const ref = (x: string | ExerciseRef): ExerciseRef => (typeof x === 'string' ? (library[x] ?? { key: x, name: x.replace(/^[a-z]+_/, '').replace(/_/g, ' '), unit: '', step: 1 }) : x);
  const step = (s: RawStep, i: string): Step => (s.kind === 'rest' ? { ...s, id: s.id || i } : { ...s, id: s.id || i, exercise: ref(s.exercise) });
  const item = (it: RawStep | RawBlock, i: number): Item => (it.kind === 'block' ? { ...it, id: it.id || `b${i}`, steps: it.steps.map((s, j) => step(s, `s${i}-${j}`)) } : step(it, `s${i}`));
  return { ...data, items: data.items.map(item) } as Runsheet;
};
