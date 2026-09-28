/**
 * Putting a logged session right afterwards: one set's load, reps, time, distance, calories or type,
 * a set added or taken off.
 * The row's `target` and `reps`, which older readers (next session's loads, the progression rules)
 * still read, are worked out again from the sets exactly as the timer writes them, so every reader
 * sees the edit. Pure; ported to `ios/TigerWorkouts/Results/EditSets.swift`.
 */
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

/** Change one set of one row. A row from before per-set results gets its sets written out first. */
export const editSet = (result: SessionResult, key: string, index: number, patch: SetPatch): SessionResult => ({
  ...result,
  steps: result.steps.map(s => {
    if (rowKey(s) !== key) return s;
    const sets = setsOf(s).map((x, i) => (i === index ? apply(x, patch) : x));
    return index < sets.length ? withSets(s, sets) : s;
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

/** One more set on a row after the session: a copy of its last set's numbers, as a normal set with
 * no session time (it was not ticked in the timer). A row with no sets yet gets them written out. */
export const addSet = (result: SessionResult, key: string): SessionResult => ({
  ...result,
  steps: result.steps.map(s => {
    if (rowKey(s) !== key) return s;
    const sets = setsOf(s);
    const last = sets.at(-1);
    const copy: SetResult = {};
    for (const f of ['load', 'reps', 'meters', 'calories', 'seconds'] as const) if (last?.[f] !== undefined) copy[f] = last[f];
    return withSets(s, [...sets, copy]);
  }),
});

/** Take one set off a row. The last set gone takes the row with it. */
export const removeSet = (result: SessionResult, key: string, index: number): SessionResult => ({
  ...result,
  steps: result.steps.flatMap(s => {
    if (rowKey(s) !== key) return [s];
    const sets = setsOf(s).filter((_, i) => i !== index);
    return sets.length ? [withSets(s, sets)] : [];
  }),
});
