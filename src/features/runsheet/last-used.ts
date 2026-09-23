import type { SessionResult } from './progression';
import type { ExerciseStep, Item, Runsheet } from './model';
import { applySettings, hasSettings, type WorkoutSettings } from './settings';

export interface LastUsed {
  target?: number;
  incline?: number;
  /** When the session that used it started. */
  at: string;
}

/**
 * What you actually used, most recent first: keyed by workout and step for the exact step
 * (`step:<workout>:<step>` — catalogue step ids like "s1" repeat across workouts), and by
 * exercise key so the same machine carries across workouts. Sessions are read newest first and
 * the first hit wins, so an older session never overwrites a newer one.
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
      const v = { target: s.target, incline: s.incline, at: r.startedAt };
      seen(`step:${r.runsheetId}:${s.stepId}`, v);
      seen(`ex:${s.exerciseKey}`, v);
    }
  }
  return out;
};

const later = (a: string, b: string) => Date.parse(a) > Date.parse(b);

/**
 * Where weight, speed and incline start, most specific first:
 *   1. this step in a session of this workout done *after* you saved a setting for it
 *   2. your saved setting for this step
 *   3. this step in an older session of this workout
 *   4. the same exercise in any other workout, most recent
 *   5. the workout as written
 * A saved setting beats everything older than it and everything carried over from elsewhere;
 * only doing this workout again, after saving, moves the number on.
 */
const seed = (s: ExerciseStep, m: Map<string, LastUsed>, runsheetId: string, ws?: WorkoutSettings): ExerciseStep => {
  const exact = m.get(`step:${runsheetId}:${s.id}`);
  const cross = m.get(`ex:${s.exercise.key}`);
  const set = ws?.steps[s.id];
  const pick = (f: 'target' | 'incline'): number | undefined => {
    const own = set?.[f];
    if (exact?.[f] !== undefined && (own === undefined || later(exact.at, set!.at))) return exact[f];
    if (own !== undefined) return own;
    if (cross?.[f] !== undefined) return cross[f];
    return s[f] as number | undefined;
  };
  // A relative load (% of a training max) is computed at run time; leave it to the resolver.
  const target = typeof s.target === 'number' ? pick('target') : s.target;
  const incline = pick('incline');
  return target === s.target && incline === s.incline ? s : { ...s, target, incline };
};

/**
 * Start a workout on your numbers: your saved settings for it, and the treadmill speed, incline
 * and weight you finished on — rather than whatever the workout was written with.
 */
export const withLastUsed = (r: Runsheet, results: SessionResult[], ws?: WorkoutSettings): Runsheet => {
  const m = results.length ? lastUsed(results) : new Map<string, LastUsed>();
  if (!m.size && !hasSettings(ws)) return r;
  // Reps, rests and rounds come from the settings alone; seed() then settles weight, speed and incline.
  const withSettings = applySettings(r, ws);
  const id = r.id ?? r.title;
  const item = (it: Item): Item => {
    if (it.kind === 'block') return { ...it, steps: it.steps.map(s => (s.kind === 'exercise' ? seed(s, m, id, ws) : s)) };
    if (it.kind === 'exercise') return seed(it, m, id, ws);
    return it;
  };
  return { ...withSettings, items: withSettings.items.map(item) };
};
