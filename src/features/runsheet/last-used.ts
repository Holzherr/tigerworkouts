import { workingLoad, type SessionResult, type SetResult, type StepResult } from './progression';
import { ofWorkout, shortUnit, type ExerciseStep, type Item, type Runsheet } from './model';
import { measured } from '@/features/results/logbook';

export interface LastUsed {
  target?: number;
  incline?: number;
  /** On a step entry: the exercise that step was when it was done. An edit can put another
   * exercise under an old step id, and that one's load is not this one's. */
  exerciseKey?: string;
}

/** The workout whose history a step id means something in. Step ids are per workout ("s1" is in
 * hundreds of them), so a step hit only counts from this workout's own sessions — or, for an
 * edited copy, the original's (`lineage`). */
export type Workout = Pick<Runsheet, 'id' | 'title' | 'copyOf'>;

/**
 * What you actually used, most recent first: keyed by step id for the exact step in this workout
 * (`step:<id>`, from its own sessions only), and by exercise key so the same machine carries
 * across workouts (`ex:<key>`, from every session). Sessions are read newest first and the first
 * hit wins, so an older session never overwrites a newer one. Without a workout there are no step
 * entries.
 */
export const lastUsed = (results: SessionResult[], workout?: Workout): Map<string, LastUsed> => {
  const out = new Map<string, LastUsed>();
  const mine = workout ? ofWorkout(workout) : () => false;
  const seen = (k: string, v: LastUsed) => {
    if (out.has(k)) return;
    if (v.target === undefined && v.incline === undefined) return;
    out.set(k, v);
  };
  for (const r of [...results].sort((a, b) => b.startedAt.localeCompare(a.startedAt))) {
    const own = mine(r);
    for (const s of r.steps) {
      // A drop set at the end is not where the next session starts.
      const v = { target: workingLoad(s), incline: s.incline };
      if (own) seen(`step:${s.stepId}`, { ...v, exerciseKey: s.exerciseKey });
      seen(`ex:${s.exerciseKey}`, v);
    }
  }
  return out;
};

const seed = (s: ExerciseStep, m: Map<string, LastUsed>): ExerciseStep => {
  const step = m.get(`step:${s.id}`);
  const hit = (step?.exerciseKey === s.exercise.key ? step : undefined) ?? m.get(`ex:${s.exercise.key}`);
  if (!hit) return s;
  // A relative load (% of a training max) is computed at run time; leave it to the resolver.
  const target = typeof s.target === 'number' && hit.target !== undefined ? hit.target : s.target;
  const incline = hit.incline !== undefined ? hit.incline : s.incline;
  return target === s.target && incline === s.incline ? s : { ...s, target, incline };
};

/**
 * Start a workout on the numbers you finished on. The treadmill speed and incline, and the
 * weight on the bench, are what you set last time rather than whatever the workout was written
 * with — the thing you would otherwise dial in again at the start of every block.
 */
export const withLastUsed = (r: Runsheet, results: SessionResult[]): Runsheet => {
  if (!results.length) return r;
  const m = lastUsed(results, r);
  if (!m.size) return r;
  const item = (it: Item): Item => {
    if (it.kind === 'block') return { ...it, steps: it.steps.map(s => (s.kind === 'exercise' ? seed(s, m) : s)) };
    if (it.kind === 'exercise') return seed(it, m);
    return it;
  };
  return { ...r, items: r.items.map(item) };
};

/** The set a row is judged by: the heaviest, then the most reps. Older results have no per-set
 * rows, so their one load and best rep count stand in. */
const topSet = (s: StepResult): SetResult | undefined => {
  const sets = s.sets?.length ? s.sets : [{ load: s.target, reps: s.reps?.length ? Math.max(...s.reps) : undefined }];
  const best = [...sets].sort((a, b) => (b.load ?? 0) - (a.load ?? 0) || (b.reps ?? 0) - (a.reps ?? 0))[0];
  return best && (best.load !== undefined || best.reps !== undefined) ? best : undefined;
};

/** The step of this workout first (its own sessions, or the original's for an edited copy), then the
 * same exercise in any workout. Without a workout, only the exercise. */
const stepThenExercise = (step: ExerciseStep, workout: Workout | undefined) => {
  const mine = workout ? ofWorkout(workout) : undefined;
  const sameStep = (r: SessionResult, x: StepResult) => !!mine?.(r) && x.stepId === step.id && x.exerciseKey === step.exercise.key;
  const sameExercise = (_: SessionResult, x: StepResult) => x.exerciseKey === step.exercise.key;
  return mine ? [sameStep, sameExercise] : [sameExercise];
};

/** What this step was done at last time — the same step of this workout if it has history, else
 * the same exercise in any workout. Newest session first. */
export const lastSet = (results: SessionResult[], step: ExerciseStep, workout?: Workout): SetResult | undefined => {
  const newest = [...results].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const find = (match: (r: SessionResult, x: StepResult) => boolean) => {
    for (const r of newest) {
      const hit = r.steps.find(x => match(r, x) && topSet(x));
      if (hit) return topSet(hit);
    }
    return undefined;
  };
  for (const m of stepThenExercise(step, workout)) {
    const hit = find(m);
    if (hit) return hit;
  }
  return undefined;
};

const num = (n: number) => (Number.isInteger(n) ? `${n}` : `${Math.round(n * 10) / 10}`);

/** "last time 57.5 × 8", "last time 20 kg", "last time 12 reps". */
export const lastTimeLabel = (set: SetResult | undefined, step: ExerciseStep): string | undefined => {
  if (!set) return undefined;
  const unit = shortUnit(step.exercise.unit);
  if (set.load !== undefined && set.reps !== undefined) return `last time ${num(set.load)} × ${num(set.reps)}`;
  if (set.load !== undefined) return `last time ${num(set.load)}${unit ? ` ${unit}` : ''}`;
  if (set.reps !== undefined) return `last time ${num(set.reps)} reps`;
  return undefined;
};

/** Every set of this step last time, in order — the same step of this workout if it has history,
 * else the same exercise. For the set grid, where set 2 is shown against last time's set 2. */
export const lastSets = (results: SessionResult[], step: ExerciseStep, workout?: Workout): SetResult[] | undefined => {
  const newest = [...results].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const find = (match: (r: SessionResult, x: StepResult) => boolean) => {
    for (const r of newest) {
      const hit = r.steps.find(x => match(r, x) && x.sets?.length);
      // A legacy row that logged metres, seconds or calories as the load reads as that measure, so
      // "Use last time" never writes it onto the set as a load.
      if (hit) return measured(hit.sets!, step.exercise.unit);
    }
    return undefined;
  };
  for (const m of stepThenExercise(step, workout)) {
    const hit = find(m);
    if (hit) return hit;
  }
  return undefined;
};

/** "last 57.5 × 8" under a set row. */
export const lastSetLabel = (set: SetResult | undefined): string | undefined => {
  if (!set || (set.load === undefined && set.reps === undefined)) return undefined;
  return `last ${[set.load, set.reps].filter((n): n is number => n !== undefined).map(num).join(' × ')}`;
};
