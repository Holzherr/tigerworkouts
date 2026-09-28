/**
 * Putting a logged session right afterwards: one set's load, reps, time, distance, calories or type.
 * The row's `target` and `reps`, which older readers (next session's loads, the progression rules)
 * still read, are worked out again from the sets exactly as the timer writes them, so every reader
 * sees the edit. Pure; ported to `ios/TigerWorkouts/Results/EditSets.swift`.
 */
import { findStep, type Runsheet } from '@/features/runsheet/model';
import type { SessionResult, SetResult, StepResult } from '@/features/runsheet/progression';
import { setsOf } from './logbook';

/** The row's id as the session detail keys it: a swapped step has a row per exercise. */
export const rowKey = (s: Pick<StepResult, 'stepId' | 'exerciseKey'>) => `${s.stepId}|${s.exerciseKey}`;

/** A field set to undefined is taken off the set; a type of normal is left unset. */
export type SetPatch = { [K in keyof SetResult]?: SetResult[K] | undefined };

const apply = (x: SetResult, patch: SetPatch): SetResult => {
  const out: SetResult = { ...x };
  for (const [k, v] of Object.entries(patch) as [keyof SetResult, unknown][]) {
    if (v === undefined || (k === 'type' && v === 'normal')) delete out[k];
    else (out as Record<string, unknown>)[k] = v;
  }
  return out;
};

/** `target` is the last working set's load and `reps` every working set's reps, as `toResult` writes
 * them: a warm-up is not the load worked at, and its reps are not work. */
export const withSets = (row: StepResult, sets: SetResult[]): StepResult => {
  const work = sets.filter(x => x.type !== 'warmup');
  const load = [...work].reverse().find(x => x.load !== undefined)?.load;
  const out: StepResult = { ...row, sets, reps: work.flatMap(x => (x.reps !== undefined ? [x.reps] : [])) };
  if (load !== undefined) out.target = load;
  else if (sets.some(x => x.load !== undefined)) out.target = sets.find(x => x.load !== undefined)!.load;
  else delete out.target;
  return out;
};

/** Whether a row under a progression rule is still a success after its reps changed: a working set
 * under the plan's reps is a miss, and reps put back up to the plan clear a miss the short set made.
 * Without a plan (a per-set prescription, a workout gone), fewer reps than logged is a miss. */
const successAfter = (row: StepResult, before: SetResult[], after: SetResult[], plan?: number): boolean | undefined => {
  if (row.success === undefined) return undefined;
  const work = (xs: SetResult[]) => xs.filter(x => x.type !== 'warmup');
  if (plan !== undefined) {
    const short = (xs: SetResult[]) => work(xs).some(x => x.reps !== undefined && x.reps < plan);
    if (short(after)) return false;
    return short(before) ? true : row.success;
  }
  return after.some((x, i) => x.type !== 'warmup' && x.reps !== undefined && before[i]?.reps !== undefined && x.reps < before[i].reps!) ? false : row.success;
};

/** The reps a step prescribes for every set, for `editSet`; undefined for a per-set prescription,
 * a ladder (its rungs scale the reps) or a step that is not a set of reps. */
export const plannedReps = (r: Runsheet | undefined, stepId: string): number | undefined => {
  const p = r ? findStep(r.items, stepId) : null;
  if (!r || !p) return undefined;
  const it = r.items[p.itemIndex];
  const step = it.kind === 'block' && p.stepIndex !== undefined ? it.steps[p.stepIndex] : it;
  if (it.kind === 'block' && it.mode === 'ladder') return undefined;
  return step.kind === 'exercise' && step.forMode === 'reps' && !step.sets?.some(x => x.reps !== undefined) ? step.forValue : undefined;
};

/** Change one set of one row. A row from before per-set results gets its sets written out first.
 * `plan` is the step's prescribed reps, when it prescribes one number for every set. */
export const editSet = (result: SessionResult, key: string, index: number, patch: SetPatch, plan?: number): SessionResult => ({
  ...result,
  steps: result.steps.map(s => {
    if (rowKey(s) !== key) return s;
    const before = setsOf(s);
    const sets = before.map((x, i) => (i === index ? apply(x, patch) : x));
    if (index >= sets.length) return s;
    const out = withSets(s, sets);
    if (!('reps' in patch)) return out;
    const success = successAfter(s, before, sets, plan);
    return success === undefined ? out : { ...out, success };
  }),
});

/** The load for a whole row, as the result sheet's stepper sets it: every set that was at the old
 * load (or had none) goes to the new one. A pyramid's other steps keep theirs. */
export const withRowLoad = (row: StepResult, load: number): StepResult => {
  const sets = setsOf(row);
  if (!sets.length) return { ...row, target: load };
  const was = row.target;
  return withSets(row, sets.map(x => (x.load === was || (x.load === undefined && x.type !== 'warmup') ? { ...x, load } : x)));
};
