import type { SessionResult } from './progression';
import type { ExerciseStep, Item, Runsheet } from './model';

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
