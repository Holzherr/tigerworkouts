import type { LibraryExercise } from './library';

/** What makes two library entries the same exercise to read: the name and what it is counted in. */
const nameKey = (e: LibraryExercise) => `${e.name.trim().toLowerCase()}|${e.unit.trim().toLowerCase()}`;

/**
 * One row per exercise as it reads. The library has a few entries twice under different keys
 * ("Dumbbell front squat" as `db_front_squat` and `db_squat`), and an import can add one more; a
 * picker listing both looks broken. Kept: the one used in more workouts, then the one with a demo
 * clip or picture, then the first. Both keys still resolve everywhere else.
 */
export const uniqueExercises = (list: LibraryExercise[], usage: Record<string, number> = {}): LibraryExercise[] => {
  const rank = (e: LibraryExercise) => (usage[e.key] ?? 0) * 4 + (e.clip ? 2 : 0) + (e.poster ? 1 : 0);
  const best = new Map<string, LibraryExercise>();
  for (const e of list) {
    const had = best.get(nameKey(e));
    if (!had || rank(e) > rank(had)) best.set(nameKey(e), e);
  }
  return list.filter(e => best.get(nameKey(e)) === e);
};
