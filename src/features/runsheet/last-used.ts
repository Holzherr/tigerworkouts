import { workingLoad, type SessionResult, type SetResult, type StepResult } from './progression';
import { measureOf, ofWorkout, plannedSet, plannedType, shortUnit, type ExerciseStep, type Item, type Runsheet, type SetPlan, type SetType } from './model';
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
  // A relative load (% of a training max, × bodyweight) is computed at run time; leave it to the
  // resolver. A lift written with no load at all (most catalogue programs) takes last time's: it
  // used to start at 0 kg every session, sixteen taps from where you left off.
  const relative = s.targetPct !== undefined || s.loadFactor !== undefined || (s.target !== undefined && typeof s.target !== 'number');
  const target = !relative && hit.target !== undefined ? hit.target : s.target;
  const incline = hit.incline !== undefined ? hit.incline : s.incline;
  return target === s.target && incline === s.incline ? s : { ...s, target, incline };
};

const isWork = (type: SetType | undefined) => type !== 'warmup' && type !== 'drop';

/**
 * A plan for every set of a step: set n's load (and type) from last time's set n, or `target` on a
 * working set when today's target is followed; past last time's sets, the plan's own load or the
 * set before's. Reps stay the plan's. Port of `Settings.seededSets` in LastUsed.swift.
 */
export const seededSets = (s: ExerciseStep, rounds: number, last: SetResult[], target: number | undefined): SetPlan[] => {
  const out: SetPlan[] = [];
  for (let i = 0; i < rounds; i++) {
    const own = s.sets?.[i];
    const then = last[i];
    const planned = plannedType(s, i);
    const type = then ? ((then.type ?? 'normal') === 'normal' ? undefined : then.type) : planned === 'normal' ? undefined : planned;
    const load = target !== undefined && isWork(type) ? target : (then?.load ?? own?.load ?? out[out.length - 1]?.load ?? plannedSet(s, i).load);
    out.push({ ...(own?.reps !== undefined ? { reps: own.reps } : {}), ...(load !== undefined ? { load } : {}), ...(type ? { type } : {}) });
  }
  return out;
};

/** A programme's own progression rule covers this step: the runsheet's, or its block's. */
const ruledStep = (r: Runsheet, s: ExerciseStep) => !!r.progression || r.items.some(i => i.kind === 'block' && !!i.progression && i.steps.some(x => x.id === s.id));

/**
 * Start a workout on the numbers you finished on. The treadmill speed and incline, and the
 * weight on the bench, are what you set last time rather than whatever the workout was written
 * with — the thing you would otherwise dial in again at the start of every block.
 *
 * In a block done for sets, each set starts on its own set last time (`lastSession`), so a pyramid
 * (100 × 8, 110 × 4, 110 × 4) comes back as it was done rather than as one load. Where today's
 * target (`targets`, from `setTargets` on the same workout) moves sets that were all one load last
 * time, the working sets start on its load instead, so the Target line over the timer is what the
 * sets are filled with. A step a programme's rules load is left to them. Port of
 * `Settings.withLastUsed` in LastUsed.swift.
 */
export const withLastUsed = (r: Runsheet, results: SessionResult[], targets: { stepId: string; exerciseKey: string; load?: number }[] = []): Runsheet => {
  if (!results.length) return r;
  const m = lastUsed(results, r);
  if (!m.size) return r;
  const perSet = (s: ExerciseStep, rounds: number | undefined): ExerciseStep => {
    const loaded = s.target !== undefined || !!s.sets?.some(x => x.load !== undefined);
    if (!loaded || s.targetPct !== undefined || s.loadFactor !== undefined || measureOf(s.exercise.unit) || ruledStep(r, s)) return s;
    const last = lastSession(results, s, r);
    if (!last?.length) return s;
    const target = targets.find(t => t.stepId === s.id && t.exerciseKey === s.exercise.key)?.load;
    const follow = target !== undefined && new Set(last.filter(x => isWork(x.type)).map(x => x.load ?? -1)).size <= 1;
    if (rounds !== undefined) {
      const sets = seededSets(s, rounds, last, follow ? target : undefined);
      const first = sets.find(x => isWork(x.type))?.load ?? sets[0]?.load;
      return { ...s, sets, ...(first !== undefined ? { target: first } : {}) };
    }
    return follow ? { ...s, target } : s;
  };
  const item = (it: Item): Item => {
    if (it.kind === 'block') {
      const rounds = (it.mode ?? 'rounds') === 'rounds' ? Math.max(1, it.repeat) : undefined;
      return { ...it, steps: it.steps.map(s => (s.kind === 'exercise' ? perSet(seed(s, m), rounds) : s)) };
    }
    if (it.kind === 'exercise') return perSet(seed(it, m), undefined);
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

// ── last session, set by set ──

/**
 * "last time" everywhere (Priyanka via Nick, 15 Nov 2026): the last session's logged sets of this
 * step, in order — the same step of this workout first, else the same exercise in any workout. Not
 * the heaviest set (`topSet`), not one load for the whole step. A row from before sets were kept
 * stands in with its reps at its one load. Port of `LastTime.lastSession` in LastUsed.swift.
 */
export const lastSession = (results: SessionResult[], step: ExerciseStep, workout?: Workout): SetResult[] | undefined => {
  const newest = [...results].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  for (const match of stepThenExercise(step, workout)) {
    for (const r of newest) {
      for (const row of r.steps) {
        if (!match(r, row)) continue;
        const sets = row.sets?.length ? row.sets : (row.reps ?? []).map(reps => ({ reps, load: row.target }));
        const logged = measured(sets, step.exercise.unit).filter(x => x.load !== undefined || x.reps !== undefined);
        if (logged.length) return logged;
      }
    }
  }
  return undefined;
};

/** "100 × 8, 110 × 4", "100 × 8 (×3)" for three the same in a row, "12, 12, 10 reps" without a
 * load, "10 kph" without reps. At most `limit` groups, then "+N more". */
export const compactSets = (sets: SetResult[], unit = '', limit = 4): string | undefined => {
  const groups: { set: SetResult; count: number }[] = [];
  for (const x of sets) {
    const g = groups[groups.length - 1];
    if (g && g.set.load === x.load && g.set.reps === x.reps) g.count++;
    else groups.push({ set: x, count: 1 });
  }
  if (!groups.length) return undefined;
  const loads = sets.some(x => x.load !== undefined);
  const reps = sets.some(x => x.reps !== undefined);
  const one = ({ set, count }: { set: SetResult; count: number }) => {
    const times = count > 1 ? ` (×${count})` : '';
    if (set.load !== undefined && set.reps !== undefined) return `${num(set.load)} × ${num(set.reps)}${times}`;
    if (set.load !== undefined) return `${num(set.load)}${times}`;
    if (set.reps !== undefined) return loads ? `${num(set.reps)} reps${times}` : `${num(set.reps)}${times}`;
    return '';
  };
  let text = groups.slice(0, limit).map(one).filter(Boolean).join(', ');
  if (!loads && reps) text += ' reps';
  if (loads && !reps && unit) text += ` ${unit}`;
  const rest = groups.slice(limit).reduce((n, g) => n + g.count, 0);
  if (rest > 0) text += ` +${rest} more`;
  return text || undefined;
};

/** "last time 100 × 8, 110 × 4" under a step's name: the same line on the workout page, the
 * exercise's sheet and the editor. */
export const lastSessionLabel = (results: SessionResult[], step: ExerciseStep, workout?: Workout): string | undefined => {
  const sets = lastSession(results, step, workout);
  const text = sets && compactSets(sets, shortUnit(step.exercise.unit));
  return text ? `last time ${text}` : undefined;
};

/** Last time's set for one round of a step: set n against set n, the last set past the end. */
export const lastSessionSet = (results: SessionResult[], step: ExerciseStep, round: number, workout?: Workout): SetResult | undefined => {
  const all = lastSession(results, step, workout);
  return all?.length ? all[Math.min(Math.max(0, round), all.length - 1)] : undefined;
};
