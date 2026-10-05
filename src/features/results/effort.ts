import type { ExerciseGroup } from '@/features/exercises/library';
import type { SessionResult } from '@/features/runsheet/progression';
import type { ExerciseStep, Runsheet, SetType } from '@/features/runsheet/model';

/**
 * Rough METs per kind of work. Calories from METs are an estimate and nothing more — without
 * heart rate they are a function of time and bodyweight, so treat the number as a scale to beat
 * rather than a measurement.
 */
const MET: Partial<Record<ExerciseGroup, number>> = {
  treadmill: 11,
  run: 10,
  walk: 6,
  bike: 8,
  rower: 8,
  swim: 8,
  kettlebell: 9,
  barbell: 6,
  dumbbell: 5,
  body: 6,
  core: 4,
  band: 4,
  gym: 6,
};
const DEFAULT_MET = 6;
const DEFAULT_KG = 80;

export interface Effort {
  /** Seconds of actual work, rest excluded. */
  workSec: number;
  /** Sets completed across the session. A warm-up is not a set of work, and a drop set is part of the set before it. */
  sets: number;
  /** kg moved: load × reps, summed, warm-ups left out. Zero for a session with no weights. */
  tonnage: number;
  kcal: number;
  /** True when bodyweight is a guess, so the screen can say so. */
  estimatedWeight: boolean;
}

/** One set done: how long it took, its reps and load, and its type when it is not a normal set. */
export interface Worked {
  name?: string;
  group?: ExerciseGroup;
  seconds: number;
  reps: number;
  load?: number;
  type?: SetType;
}

export const effort = (
  r: SessionResult,
  worked: Worked[],
  bodyweightKg?: number
): Effort => {
  const kg = bodyweightKg ?? DEFAULT_KG;
  const workSec = worked.reduce((t, w) => t + w.seconds, 0) || (r.durationSec ?? 0);
  const kcal = worked.reduce((t, w) => t + ((MET[w.group ?? 'body'] ?? DEFAULT_MET) * 3.5 * kg) / 200 / 60 * w.seconds, 0);
  return {
    workSec,
    sets: worked.filter(w => w.type !== 'warmup' && w.type !== 'drop').length,
    tonnage: worked.reduce((t, w) => t + (w.type === 'warmup' ? 0 : (w.load ?? 0) * w.reps), 0),
    kcal: Math.round(kcal),
    estimatedWeight: bodyweightKg === undefined,
  };
};

export const startOfWeek = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return x;
};

export interface Streak {
  /** Consecutive weeks, counting back from this one, with at least one session. */
  weeks: number;
  thisWeek: number;
  lastWeek: number;
  total: number;
}

/** Sessions per week and how many weeks in a row you have trained, counting back from today. */
export const streak = (results: SessionResult[], today = new Date()): Streak => {
  const week = startOfWeek(today).getTime();
  const wk = (iso: string) => startOfWeek(new Date(iso)).getTime();
  const counts = new Map<number, number>();
  for (const r of results) counts.set(wk(r.startedAt), (counts.get(wk(r.startedAt)) ?? 0) + 1);
  // Step back by calendar week, not by 7 × 24 h: the week holding a clock change is 167 or 169
  // hours long, and a fixed step misses the Monday midnight the sessions are keyed by.
  const before = (t: number) => {
    const d = new Date(t);
    d.setDate(d.getDate() - 7);
    return d.getTime();
  };
  let weeks = 0;
  for (let w = week; counts.get(w); w = before(w)) weeks++;
  return { weeks, thisWeek: counts.get(week) ?? 0, lastWeek: counts.get(before(week)) ?? 0, total: results.length };
};

/** The same exercise's load over time, newest last, for "is it going up". */
export const loadTrend = (results: SessionResult[], exerciseKey: string): { at: string; load: number }[] =>
  [...results]
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .flatMap(r => {
      const s = r.steps.find(x => x.exerciseKey === exerciseKey && x.target !== undefined);
      return s ? [{ at: r.startedAt, load: s.target! }] : [];
    });

/**
 * One entry per set actually done, from the logged steps plus the runsheet they came from.
 * The runsheet supplies how long a set was and how many rounds; the log supplies the load.
 * Without the runsheet it still works — a set is assumed, with the session's own average length.
 * A row with per-set results gives one entry per set, each with its own load and type.
 */
export const workedFrom = (
  r: SessionResult,
  runsheet: Runsheet | undefined,
  ex: (key: string) => { name: string; group?: ExerciseGroup }
): (Worked & { name: string })[] => {
  const found = new Map<string, { step: ExerciseStep; rounds: number }>();
  for (const it of runsheet?.items ?? []) {
    if (it.kind === 'block') {
      for (const s of it.steps) if (s.kind === 'exercise') found.set(s.id, { step: s, rounds: it.repeat ?? 1 });
    } else if (it.kind === 'exercise') {
      found.set(it.id, { step: it, rounds: 1 });
    }
  }
  const fallback = r.durationSec && r.steps.length ? Math.round((r.durationSec * 0.5) / r.steps.length) : 45;
  return r.steps.flatMap(s => {
    const hit = found.get(s.stepId);
    const meta = ex(s.exerciseKey);
    const secs = hit ? setSeconds(hit.step) : fallback;
    const rounds = Math.max(1, s.reps?.length || hit?.rounds || 1);
    const reps = (n: number) => s.reps?.[n] ?? (hit?.step.forMode === 'reps' ? hit.step.forValue : 0);
    if (s.sets?.length)
      return s.sets.map(x => ({ name: meta.name, group: meta.group, seconds: secs, reps: x.reps ?? (hit?.step.forMode === 'reps' ? hit.step.forValue : 0), load: x.load ?? s.target, ...(x.type && x.type !== 'normal' ? { type: x.type } : {}) }));
    return Array.from({ length: rounds }, (_, n) => ({ name: meta.name, group: meta.group, seconds: secs, reps: reps(n), load: s.target }));
  });
};

const setSeconds = (s: ExerciseStep): number => {
  if (s.forMode === 'seconds') return s.forValue;
  if (s.forMode === 'minutes') return s.forValue * 60;
  return 45;
};
