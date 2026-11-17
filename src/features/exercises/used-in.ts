import type { Runsheet } from '@/features/runsheet/model';
import { musclesFor, type Muscle } from '@/features/results/muscles';
import type { ExerciseGroup } from './library';

/** Whether a workout has this exercise in it, loose or in a block. */
export const usesExercise = (r: Runsheet, key: string) => r.items.some(it => (it.kind === 'block' ? it.steps.some(s => s.kind === 'exercise' && s.exercise.key === key) : it.kind === 'exercise' && it.exercise.key === key));

/** The workouts that use an exercise, your own first, then in the order given (review round 2 U14). */
export const workoutsWith = (key: string, workouts: Runsheet[], own: Set<string> = new Set()): Runsheet[] => {
  const found = workouts.filter(r => usesExercise(r, key));
  return [...found.filter(r => r.id && own.has(r.id)), ...found.filter(r => !r.id || !own.has(r.id))];
};

/** The muscles an exercise works, the main ones first: the same reading the body map uses. */
export const musclesWorked = (name: string, group?: ExerciseGroup): { main: Muscle[]; also: Muscle[] } => {
  const share = Object.entries(musclesFor(name, group)) as [Muscle, number][];
  return { main: share.filter(([, n]) => n >= 1).map(([m]) => m), also: share.filter(([, n]) => n < 1).map(([m]) => m) };
};

/** A key with no exercise behind it, as words: `bb_back_squat` reads "Bb back squat", `squat` "Squat". */
export const nameFromKey = (key: string) => {
  const s = key.replace(/[_-]+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : key;
};
