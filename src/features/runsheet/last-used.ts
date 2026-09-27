import type { SessionResult, SetResult, StepResult } from './progression';
import { shortUnit, type ExerciseStep, type Item, type Runsheet } from './model';

export interface LastUsed {
  target?: number;
  incline?: number;
}

/**
 * What you actually used, most recent first: keyed by step id for the exact step in this workout,
 * and by exercise key so the same machine carries across workouts. Sessions are read newest first
 * and the first hit wins, so an older session never overwrites a newer one.
 */
export const lastUsed = (results: SessionResult[]): Map<string, LastUsed> => {
  const out = new Map<string, LastUsed>();
  const seen = (k: string, v: LastUsed) => {
    if (out.has(k)) return;
    if (v.target === undefined && v.incline === undefined) return;
    out.set(k, v);
  };
  for (const r of [...results].sort((a, b) => b.startedAt.localeCompare(a.startedAt))) {
    for (const s of r.steps) {
      const v = { target: s.target, incline: s.incline };
      seen(`step:${s.stepId}`, v);
      seen(`ex:${s.exerciseKey}`, v);
    }
  }
  return out;
};

const seed = (s: ExerciseStep, m: Map<string, LastUsed>): ExerciseStep => {
  const hit = m.get(`step:${s.id}`) ?? m.get(`ex:${s.exercise.key}`);
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
  const m = lastUsed(results);
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

/** What this step was done at last time — the same step if it has history, else the same exercise
 * in any workout. Newest session first. */
export const lastSet = (results: SessionResult[], step: ExerciseStep): SetResult | undefined => {
  const newest = [...results].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const find = (match: (x: StepResult) => boolean) => {
    for (const r of newest) {
      const hit = r.steps.find(x => match(x) && topSet(x));
      if (hit) return topSet(hit);
    }
    return undefined;
  };
  return find(x => x.stepId === step.id && x.exerciseKey === step.exercise.key) ?? find(x => x.exerciseKey === step.exercise.key);
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

/** Every set of this step last time, in order — the same step if it has history, else the same
 * exercise. For the set grid, where set 2 is shown against last time's set 2. */
export const lastSets = (results: SessionResult[], step: ExerciseStep): SetResult[] | undefined => {
  const newest = [...results].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const find = (match: (x: StepResult) => boolean) => {
    for (const r of newest) {
      const hit = r.steps.find(x => match(x) && x.sets?.length);
      if (hit) return hit.sets;
    }
    return undefined;
  };
  return find(x => x.stepId === step.id && x.exerciseKey === step.exercise.key) ?? find(x => x.exerciseKey === step.exercise.key);
};

/** "last 57.5 × 8" under a set row. */
export const lastSetLabel = (set: SetResult | undefined): string | undefined => {
  if (!set || (set.load === undefined && set.reps === undefined)) return undefined;
  return `last ${[set.load, set.reps].filter((n): n is number => n !== undefined).map(num).join(' × ')}`;
};
