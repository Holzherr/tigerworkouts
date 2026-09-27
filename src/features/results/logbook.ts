/**
 * The logbook: one exercise across every session it was done in, its best set per session over
 * time, and its records. Pure functions over `SessionResult[]`, keyed by exercise key — a step
 * swapped mid-session logs a row per exercise, so the key is what the history follows, not the
 * step. Ported one for one to `ios/TigerWorkouts/Results/Logbook.swift`.
 */
import type { SessionResult, SetResult, StepResult } from '@/features/runsheet/progression';

/** One session of one exercise: every set of it in that session, in order. */
export interface LogSession {
  id?: string;
  runsheetId: string;
  title: string;
  startedAt: string;
  sets: SetResult[];
  /** Highest treadmill incline used in the session. */
  incline?: number;
  /** Per set: did it beat a record standing before it. Never true in the first session. */
  prs: boolean[];
}

/**
 * What the chart and records measure, from what was logged:
 * `strength` load and reps (estimated 1RM), `load` load only (a weight held, a treadmill speed),
 * `reps` reps only (bodyweight), `rounds` neither — timed work, counted in rounds.
 */
export type LogKind = 'strength' | 'load' | 'reps' | 'rounds';

export interface Rec {
  value: number;
  /** startedAt of the session that set it. */
  at: string;
  /** The set behind it, for "100 × 5". Unset for session volume. */
  set?: SetResult;
}

export interface Records {
  kind: LogKind;
  sessions: number;
  heaviest?: Rec;
  e1rm?: Rec;
  reps?: Rec;
  /** Load × reps summed over a session. */
  volume?: Rec;
}

/** A row's sets. Older results have no per-set rows: their one load and each rep count stand in. */
export const setsOf = (s: StepResult): SetResult[] => {
  if (s.sets?.length) return s.sets;
  if (s.reps?.length) return s.reps.map(reps => ({ reps, ...(s.target !== undefined ? { load: s.target } : {}) }));
  return s.target !== undefined ? [{ load: s.target }] : [];
};

const loaded = (x: SetResult) => x.load !== undefined && x.load > 0;
const counted = (x: SetResult) => x.reps !== undefined && x.reps > 0;

/** Sets above this many reps say nothing reliable about a one-rep max. */
export const E1RM_MAX_REPS = 10;

/**
 * Estimated one-rep max by Epley: load × (1 + reps / 30), and the load itself for a single.
 * Epley over a percentage table because it is one line on both platforms and within a few percent
 * of the tables up to about 10 reps. Past 10 it overstates, so those sets get no estimate: they
 * still count for most reps and for volume.
 */
export const e1rm = (x: SetResult): number | undefined => {
  if (!loaded(x) || !counted(x) || x.reps! > E1RM_MAX_REPS) return undefined;
  return x.reps === 1 ? x.load! : x.load! * (1 + x.reps! / 30);
};

/** Every session the exercise was done in, newest first, with each set's PR flag. */
export const exerciseHistory = (results: SessionResult[], exerciseKey: string): LogSession[] => {
  const out: LogSession[] = [];
  for (const r of [...results].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    const rows = r.steps.filter(s => s.exerciseKey === exerciseKey);
    if (!rows.length) continue;
    const sets = rows.flatMap(setsOf);
    const inclines = rows.map(s => s.incline).filter((n): n is number => n !== undefined);
    out.push({ id: r.id, runsheetId: r.runsheetId, title: r.title ?? r.activity?.name ?? r.runsheetId, startedAt: r.startedAt, sets, ...(inclines.length ? { incline: Math.max(...inclines) } : {}), prs: [] });
  }
  // Records as they stood before each set, so a PR marks the set that set it, not today's best.
  let before = empty(kindOf(out));
  for (const s of out) {
    s.prs = s.sets.map(x => {
      const pr = before.sessions > 0 && isRecord(x, before);
      before = addSet(before, x, s.startedAt);
      return pr;
    });
    before = addSession(before, s);
  }
  return out.reverse();
};

export const kindOf = (sessions: Pick<LogSession, 'sets'>[]): LogKind => {
  const all = sessions.flatMap(s => s.sets);
  if (all.some(x => loaded(x) && counted(x))) return 'strength';
  if (all.some(loaded)) return 'load';
  if (all.some(counted)) return 'reps';
  return 'rounds';
};

const max = (ns: (number | undefined)[]) => {
  const xs = ns.filter((n): n is number => n !== undefined);
  return xs.length ? Math.max(...xs) : undefined;
};

/** Load × reps over the session's sets. Undefined when no set has both. */
export const sessionVolume = (s: Pick<LogSession, 'sets'>): number | undefined => {
  const xs = s.sets.filter(x => loaded(x) && counted(x));
  return xs.length ? xs.reduce((n, x) => n + x.load! * x.reps!, 0) : undefined;
};

const topLoad = (s: Pick<LogSession, 'sets'>) => max(s.sets.map(x => (loaded(x) ? x.load : undefined)));

/**
 * The session's best set in the chart's terms: estimated 1RM, top load, most reps, or rounds.
 * A strength session whose sets were all above 10 reps has no estimate, so its point falls back
 * to the top load — a lower number on the same line, rather than a gap.
 */
export const sessionBest = (s: Pick<LogSession, 'sets'>, kind: LogKind): number | undefined => {
  if (kind === 'strength') return max(s.sets.map(e1rm)) ?? topLoad(s);
  if (kind === 'load') return max(s.sets.map(x => (loaded(x) ? x.load : undefined)));
  if (kind === 'reps') return max(s.sets.map(x => (counted(x) ? x.reps : undefined)));
  return s.sets.length || undefined;
};

export interface ChartPoint {
  at: string;
  value: number;
}

/** One point per session, oldest first — what the chart draws. */
export const chartPoints = (history: LogSession[], kind: LogKind = kindOf(history)): ChartPoint[] =>
  [...history]
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .flatMap(s => {
      const value = sessionBest(s, kind);
      return value === undefined ? [] : [{ at: s.startedAt, value }];
    });

const empty = (kind: LogKind): Records => ({ kind, sessions: 0 });

/** Records only move on a strictly better number, so each keeps the date it was first set. */
const better = (cur: Rec | undefined, value: number | undefined, at: string, set?: SetResult): Rec | undefined =>
  value !== undefined && (!cur || value > cur.value) ? { value, at, ...(set ? { set } : {}) } : cur;

const addSet = (r: Records, x: SetResult, at: string): Records => ({
  ...r,
  heaviest: better(r.heaviest, loaded(x) ? x.load : undefined, at, x),
  e1rm: better(r.e1rm, e1rm(x), at, x),
  reps: better(r.reps, counted(x) ? x.reps : undefined, at, x),
});

const addSession = (r: Records, s: LogSession): Records => ({ ...r, sessions: r.sessions + 1, volume: better(r.volume, sessionVolume(s), s.startedAt) });

/** Heaviest load, best estimated 1RM, most reps in a set and best session volume, each with its date. */
export const records = (results: SessionResult[], exerciseKey: string): Records => {
  const history = exerciseHistory(results, exerciseKey).reverse();
  let r = empty(kindOf(history));
  for (const s of history) {
    for (const x of s.sets) r = addSet(r, x, s.startedAt);
    r = addSession(r, s);
  }
  return r;
};

/**
 * Does this set beat a record standing before it. A loaded set: a heavier load or a better
 * estimated 1RM — more reps at a light weight is not a PR. An unloaded (bodyweight) set: more
 * reps. Only an existing record can be beaten, so the first time an exercise is done is not a PR,
 * and a tie is not one either.
 */
export const isRecord = (x: SetResult, before: Records): boolean => {
  if (loaded(x)) {
    const e = e1rm(x);
    return (!!before.heaviest && x.load! > before.heaviest.value) || (e !== undefined && !!before.e1rm && e > before.e1rm.value);
  }
  return counted(x) && !!before.reps && x.reps! > before.reps.value;
};

export interface LoggedExercise {
  exerciseKey: string;
  lastAt: string;
  sessions: number;
}

/** Everything ever logged, most recently done first. */
export const loggedExercises = (results: SessionResult[]): LoggedExercise[] => {
  const m = new Map<string, LoggedExercise>();
  for (const r of results) {
    for (const key of new Set(r.steps.map(s => s.exerciseKey))) {
      const cur = m.get(key);
      if (!cur) m.set(key, { exerciseKey: key, lastAt: r.startedAt, sessions: 1 });
      else m.set(key, { ...cur, sessions: cur.sessions + 1, lastAt: r.startedAt > cur.lastAt ? r.startedAt : cur.lastAt });
    }
  }
  return [...m.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt) || a.exerciseKey.localeCompare(b.exerciseKey));
};

const num = (n: number) => (Number.isInteger(n) ? `${n}` : `${Math.round(n * 10) / 10}`);

/** "100 × 5", "14.5 kph", "12 reps", or "" for a round with nothing counted. */
export const setLabel = (x: SetResult, unit = ''): string => {
  if (x.load !== undefined && x.reps !== undefined) return `${num(x.load)} × ${num(x.reps)}`;
  if (x.load !== undefined) return `${num(x.load)}${unit ? ` ${unit}` : ''}`;
  if (x.reps !== undefined) return `${num(x.reps)} reps`;
  return '';
};

export { num as fmtNum };
