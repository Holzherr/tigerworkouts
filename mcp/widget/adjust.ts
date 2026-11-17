/**
 * Load and reps on the set in progress, so the chat timer logs what was done rather than the plan
 * (review round 2 U15). The engine's own `adjust` and `setReps` change them, as on the web timer.
 */
import { showsLoad, shortUnit } from '@/features/runsheet/model';
import * as R from '@/features/timer/runner';

export interface Adjustable {
  load?: { value: number; step: number; unit: string };
  reps?: number;
}

/** What the current set lets you change: its load when it carries one, its reps when it counts them. */
export const adjustable = (s: R.RunState): Adjustable | undefined => {
  const lead = s.phase === 'lead' || (s.phase === 'paused' && s.pausedFrom === 'lead');
  const sl = R.current(s);
  if (lead || s.phase === 'done' || !sl || sl.kind !== 'work' || sl.step.kind !== 'exercise') return undefined;
  const step = sl.step;
  const load = showsLoad(step) ? { value: R.targetOf(s, sl) ?? 0, step: step.exercise.step > 0 ? step.exercise.step : 1, unit: shortUnit(step.exercise.unit) } : undefined;
  const reps = step.forMode === 'reps' || step.forMode === 'amrap' ? (s.actuals[sl.id]?.reps ?? step.forValue) : undefined;
  return load || reps !== undefined ? { load, reps } : undefined;
};

/** One tap on − or +: never below zero. */
export const nudge = (s: R.RunState, now: number, what: 'load' | 'reps', dir: 1 | -1): R.RunState => {
  const a = adjustable(s);
  if (what === 'load' && a?.load) return R.adjust(s, now, Math.max(0, Math.round((a.load.value + dir * a.load.step) * 100) / 100));
  if (what === 'reps' && a?.reps !== undefined) return R.setReps(s, Math.max(0, a.reps + dir));
  return s;
};
