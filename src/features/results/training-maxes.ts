import type { ExerciseRef, ExerciseStep, Runsheet } from '@/features/runsheet/model';
import type { TrainingMaxes } from '@/features/runsheet/progression';

const pctSteps = (r: Runsheet): ExerciseStep[] => r.items.flatMap(it => (it.kind === 'block' ? it.steps : it.kind === 'ref' ? [] : [it])).filter((s): s is ExerciseStep => s.kind === 'exercise' && s.targetPct !== undefined);

/** A max stepped down to 0 is taken off, not kept as 0 kg. */
export const setMax = (values: TrainingMaxes, key: string, kg: number): TrainingMaxes => {
  const { [key]: _gone, ...rest } = values;
  void _gone;
  return kg > 0 ? { ...rest, [key]: kg } : rest;
};

/** Me → Training maxes lists these four, every lift a workout you have loads as a % of a training
 * max, and any lift that already has one. */
export const maxLifts = (workouts: Runsheet[], values: TrainingMaxes, ref: (key: string) => ExerciseRef): ExerciseRef[] => {
  const out = new Map<string, ExerciseRef>();
  for (const k of ['bb_back_squat', 'bb_bench', 'bb_deadlift', 'bb_ohp']) out.set(k, ref(k));
  for (const w of workouts) for (const s of pctSteps(w)) if (!out.has(s.exercise.key)) out.set(s.exercise.key, s.exercise);
  for (const k of Object.keys(values)) if (!out.has(k)) out.set(k, ref(k));
  return [...out.values()];
};

