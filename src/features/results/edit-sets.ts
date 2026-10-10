/**
 * Putting a logged session right afterwards: one set's load, reps, time, distance, calories or type,
 * a set added or taken off.
 * The row's `target` and `reps`, which older readers (next session's loads, the progression rules)
 * still read, are worked out again from the sets exactly as the timer writes them, so every reader
 * sees the edit. Pure; ported to `ios/TigerWorkouts/Results/EditSets.swift`.
 */
import { findStep, plannedSet, type Runsheet } from '@/features/runsheet/model';
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

/** What a step asks for, as the timer judges it: `reps` when every working set is the same number,
 * `setReps` set by set for a per-set prescription, and `sets` how many working sets it plans (0
 * for an AMRAP, whose rounds are a guess). Warm-ups and drop sets are not working sets. */
export interface StepPlan {
  reps?: number;
  setReps?: number[];
  sets?: number;
}

/** A working set, as the progression rules count them: not a warm-up, not a drop set. */
const working = (xs: SetResult[]) => xs.filter(x => x.type !== 'warmup' && x.type !== 'drop');

/**
 * Whether a row under a progression rule is a success after an edit, the way the timer decides it:
 * a working set under the plan's reps is a miss, and so is a working set short of the plan's count
 * (skipped, or taken off). With a whole plan the answer is worked out afresh, so reps put back up
 * clear a miss and a set added back clears a skipped one. Without one (a workout gone), fewer reps
 * than logged is a miss and nothing else changes it.
 */
const successAfter = (row: StepResult, before: SetResult[], after: SetResult[], given?: number | StepPlan): boolean | undefined => {
  if (row.success === undefined) return undefined;
  const plan: StepPlan | undefined = typeof given === 'number' ? { reps: given } : given;
  const work = working(after);
  const short = (xs: SetResult[]) => working(xs).some((x, k) => x.reps !== undefined && ((plan?.setReps?.[k] ?? plan?.reps) !== undefined) && x.reps < (plan?.setReps?.[k] ?? plan!.reps)!);
  if (plan?.sets !== undefined) return work.length >= plan.sets && !short(after);
  if (plan?.reps !== undefined) return short(after) ? false : short(before) ? true : row.success;
  return after.length === before.length && after.some((x, i) => x.type !== 'warmup' && x.type !== 'drop' && x.reps !== undefined && before[i]?.reps !== undefined && x.reps < before[i].reps!) ? false : row.success;
};

/** The plan a logged row is judged against (see StepPlan); undefined for a ladder (its rungs scale
 * the reps), a step no longer in the workout, or no workout. A loose step runs once at its own
 * reps, as the timer runs it. */
export const plannedFor = (r: Runsheet | undefined, stepId: string): StepPlan | undefined => {
  const p = r ? findStep(r.items, stepId) : null;
  if (!r || !p) return undefined;
  const it = r.items[p.itemIndex];
  const step = it.kind === 'block' && p.stepIndex !== undefined ? it.steps[p.stepIndex] : it;
  if (step.kind !== 'exercise') return undefined;
  const reps = step.forMode === 'reps' ? step.forValue : undefined;
  if (it.kind !== 'block') return { ...(reps !== undefined ? { reps } : {}), sets: 1 };
  const mode = it.mode ?? 'rounds';
  if (mode === 'ladder') return undefined;
  if (mode === 'amrap') return { ...(reps !== undefined ? { reps } : {}), sets: 0 };
  const times = it.steps.filter(x => x.id === stepId).length;
  if (mode !== 'rounds' || !step.sets?.length) return { ...(reps !== undefined ? { reps } : {}), sets: Math.max(1, it.repeat) * times };
  // A per-set plan: the working sets in order, each with its own reps.
  const setReps: number[] = [];
  for (let ri = 0; ri < Math.max(1, it.repeat); ri++) {
    const type = step.sets[ri]?.type;
    if (type === 'warmup' || type === 'drop') continue;
    setReps.push(plannedSet(step, ri).reps);
  }
  const same = setReps.every(x => x === setReps[0]);
  return step.forMode === 'reps' ? { ...(same && setReps.length ? { reps: setReps[0] } : { setReps }), sets: setReps.length * times } : { sets: setReps.length * times };
};

/** The reps a step prescribes for every set; undefined for a per-set prescription, a ladder or a
 * step that is not a set of reps. */
export const plannedReps = (r: Runsheet | undefined, stepId: string): number | undefined => plannedFor(r, stepId)?.reps;

/** Change one set of one row. A row from before per-set results gets its sets written out first.
 * `plan` is what the step asks for (`plannedFor`; a bare number is its reps); `unit` the
 * exercise's, so a legacy measure logged as a load is saved back as the measure. */
export const editSet = (result: SessionResult, key: string, index: number, patch: SetPatch, plan?: number | StepPlan, unit?: string): SessionResult => ({
  ...result,
  steps: result.steps.map(s => {
    if (rowKey(s) !== key) return s;
    const before = setsOf(s, unit);
    const sets = before.map((x, i) => (i === index ? apply(x, patch) : x));
    if (index >= sets.length) return s;
    const out = withSets(s, sets);
    // Reps and type both decide a miss: a set marked a warm-up is one working set fewer.
    if (!('reps' in patch) && !('type' in patch)) return out;
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

/** One more set on a row after the session (`unit` as for `editSet`): a copy of its last set's numbers, as a normal set with
 * no session time (it was not ticked in the timer). A row with no sets yet gets them written out. */
export const addSet = (result: SessionResult, key: string, unit?: string, plan?: StepPlan): SessionResult => ({
  ...result,
  steps: result.steps.map(s => {
    if (rowKey(s) !== key) return s;
    const sets = setsOf(s, unit);
    const last = sets.at(-1);
    const copy: SetResult = {};
    for (const f of ['load', 'reps', 'meters', 'calories', 'seconds'] as const) if (last?.[f] !== undefined) copy[f] = last[f];
    return withSuccess(withSets(s, [...sets, copy]), s, sets, plan);
  }),
});
/** A row's success after a set was added or taken off: worked out afresh against a whole plan,
 * else left as it was. */
const withSuccess = (out: StepResult, row: StepResult, before: SetResult[], plan?: StepPlan): StepResult => {
  if (plan?.sets === undefined) return out;
  const success = successAfter(row, before, out.sets ?? [], plan);
  return success === undefined ? out : { ...out, success };
};

/** Take one set off a row. The last set gone takes the row with it. */
export const removeSet = (result: SessionResult, key: string, index: number, unit?: string, plan?: StepPlan): SessionResult => ({
  ...result,
  steps: result.steps.flatMap(s => {
    if (rowKey(s) !== key) return [s];
    const before = setsOf(s, unit);
    const sets = before.filter((_, i) => i !== index);
    return sets.length ? [withSuccess(withSets(s, sets), s, before, plan)] : [];
  }),
});
