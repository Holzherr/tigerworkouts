/**
 * The logbook: one exercise across every session it was done in, its best set per session over
 * time, and its records. Pure functions over `SessionResult[]`, keyed by exercise key — a step
 * swapped mid-session logs a row per exercise, so the key is what the history follows, not the
 * step. Ported one for one to `ios/TigerWorkouts/Results/Logbook.swift`.
 */
import { isWorking, type SessionResult, type SetResult, type StepResult } from '@/features/runsheet/progression';

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
 * `reps` reps only (bodyweight), `pace` distance with a time (a 500 m row: fastest pace),
 * `distance` distance alone (most metres), `calories` a calorie count (most in a set), `time`
 * time alone (a plank: longest), `rounds` none of these — sets from before times were kept.
 */
export type LogKind = 'strength' | 'load' | 'reps' | 'pace' | 'distance' | 'calories' | 'time' | 'rounds';

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
  /** Longest timed set that is not a distance or calorie count: a hold, an interval. Seconds. */
  longest?: Rec;
  /** Most metres in a set. */
  distance?: Rec;
  /** Most calories in a set. */
  calories?: Rec;
  /** Fastest time for each distance done, keyed by metres: `{ 500: 1:41 }`. Lower is better. */
  fastest?: Record<string, Rec>;
}

/** A row's sets. Older results have no per-set rows: their one load and each rep count stand in. */
export const setsOf = (s: StepResult): SetResult[] => {
  if (s.sets?.length) return s.sets;
  if (s.reps?.length) return s.reps.map(reps => ({ reps, ...(s.target !== undefined ? { load: s.target } : {}) }));
  return s.target !== undefined ? [{ load: s.target }] : [];
};

// A warm-up is logged and shown, but it is never a record, never volume and never a session's best.
const loaded = (x: SetResult) => isWorking(x) && x.load !== undefined && x.load > 0;
const counted = (x: SetResult) => isWorking(x) && x.reps !== undefined && x.reps > 0;
const distanced = (x: SetResult) => isWorking(x) && x.meters !== undefined && x.meters > 0;
const burned = (x: SetResult) => isWorking(x) && x.calories !== undefined && x.calories > 0;
const timed = (x: SetResult) => isWorking(x) && x.seconds !== undefined && x.seconds > 0;
/** A set whose time is the work: timed, and not a distance or calorie count done against the clock. */
const held = (x: SetResult) => timed(x) && !distanced(x) && !burned(x);

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
  if (all.some(x => distanced(x) && timed(x))) return 'pace';
  if (all.some(distanced)) return 'distance';
  if (all.some(burned)) return 'calories';
  if (all.some(timed)) return 'time';
  return 'rounds';
};

/** The kinds that are about load and reps, which stalls and targets read. */
export const liftKind = (k: LogKind) => k === 'strength' || k === 'load' || k === 'reps';

/** Pace in seconds per `per` metres (500 for a rower, 1000 for a run). */
export const paceOf = (x: SetResult, per = 1000): number | undefined => (distanced(x) && timed(x) ? (x.seconds! / x.meters!) * per : undefined);
const min = (ns: (number | undefined)[]) => {
  const xs = ns.filter((n): n is number => n !== undefined);
  return xs.length ? Math.min(...xs) : undefined;
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
 * The session's best set in the chart's terms: estimated 1RM, top load, most reps, fastest pace
 * (seconds per `per` metres, lower is better), most metres, most calories, longest time, or rounds.
 * A strength session whose sets were all above 10 reps has no estimate, so its point falls back
 * to the top load — a lower number on the same line, rather than a gap.
 */
export const sessionBest = (s: Pick<LogSession, 'sets'>, kind: LogKind, per = 1000): number | undefined => {
  if (kind === 'strength') return max(s.sets.map(e1rm)) ?? topLoad(s);
  if (kind === 'load') return max(s.sets.map(x => (loaded(x) ? x.load : undefined)));
  if (kind === 'reps') return max(s.sets.map(x => (counted(x) ? x.reps : undefined)));
  if (kind === 'pace') return min(s.sets.map(x => paceOf(x, per)));
  if (kind === 'distance') return max(s.sets.map(x => (distanced(x) ? x.meters : undefined)));
  if (kind === 'calories') return max(s.sets.map(x => (burned(x) ? x.calories : undefined)));
  if (kind === 'time') return max(s.sets.map(x => (held(x) ? x.seconds : undefined)));
  return s.sets.filter(isWorking).length || undefined;
};

/** Lower is better on the chart: pace. */
export const lowerIsBetter = (k: LogKind) => k === 'pace';

export interface ChartPoint {
  at: string;
  value: number;
}

/** One point per session, oldest first — what the chart draws. */
export const chartPoints = (history: LogSession[], kind: LogKind = kindOf(history), per = 1000): ChartPoint[] =>
  [...history]
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .flatMap(s => {
      const value = sessionBest(s, kind, per);
      return value === undefined ? [] : [{ at: s.startedAt, value }];
    });

/** What the chart can draw for an exercise: its kind's own best, plus session volume and total
 * reps where they mean something. */
export type ChartMetric = LogKind | 'volume' | 'totalReps';

export const METRIC_LABEL: Partial<Record<ChartMetric, string>> = { strength: 'Est. 1RM', load: 'Top load', volume: 'Volume', reps: 'Most reps', totalReps: 'Total reps', pace: 'Pace', distance: 'Distance' };

/** The metrics offered for a kind, the default first. One means no picker. */
export const chartMetrics = (kind: LogKind): ChartMetric[] =>
  kind === 'strength' ? ['strength', 'load', 'volume', 'reps'] : kind === 'reps' ? ['reps', 'totalReps'] : kind === 'pace' ? ['pace', 'distance'] : [kind];

/** One point per session for a metric, oldest first. Volume is load × reps over the working sets;
 * total reps is every working set's reps added up. */
export const pointsFor = (history: LogSession[], metric: ChartMetric, per = 1000): ChartPoint[] => {
  if (metric !== 'volume' && metric !== 'totalReps') return chartPoints(history, metric, per);
  return [...history]
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .flatMap(s => {
      const value = metric === 'volume' ? sessionVolume(s) : s.sets.filter(counted).reduce((n, x) => n + x.reps!, 0) || undefined;
      return value === undefined ? [] : [{ at: s.startedAt, value }];
    });
};

export type ChartRange = '3m' | '1y' | 'all';
export const RANGE_LABEL: Record<ChartRange, string> = { '3m': '3 m', '1y': '1 y', all: 'All' };
const RANGE_DAYS: Record<ChartRange, number | undefined> = { '3m': 90, '1y': 365, all: undefined };

/** The points inside a range ending now: the last 90 days, 365 days, or all of them. */
export const inRange = (points: ChartPoint[], range: ChartRange, now: number): ChartPoint[] => {
  const days = RANGE_DAYS[range];
  return days === undefined ? points : points.filter(p => Date.parse(p.at) >= now - days * 864e5);
};

const empty = (kind: LogKind): Records => ({ kind, sessions: 0 });

/** Records only move on a strictly better number, so each keeps the date it was first set. */
const better = (cur: Rec | undefined, value: number | undefined, at: string, set?: SetResult): Rec | undefined =>
  value !== undefined && (!cur || value > cur.value) ? { value, at, ...(set ? { set } : {}) } : cur;

/** The same for a time, where lower wins. */
const faster = (cur: Rec | undefined, value: number | undefined, at: string, set?: SetResult): Rec | undefined =>
  value !== undefined && (!cur || value < cur.value) ? { value, at, ...(set ? { set } : {}) } : cur;

/** A distance as a record key: whole metres. */
const distKey = (m: number) => String(Math.round(m));

const addSet = (r: Records, x: SetResult, at: string): Records => {
  const out: Records = {
    ...r,
    heaviest: better(r.heaviest, loaded(x) ? x.load : undefined, at, x),
    e1rm: better(r.e1rm, e1rm(x), at, x),
    reps: better(r.reps, counted(x) ? x.reps : undefined, at, x),
    longest: better(r.longest, held(x) ? x.seconds : undefined, at, x),
    distance: better(r.distance, distanced(x) ? x.meters : undefined, at, x),
    calories: better(r.calories, burned(x) ? x.calories : undefined, at, x),
  };
  if (distanced(x) && timed(x)) {
    const k = distKey(x.meters!);
    const f = faster(r.fastest?.[k], x.seconds, at, x);
    if (f !== r.fastest?.[k]) out.fastest = { ...r.fastest, [k]: f! };
  }
  for (const k of ['longest', 'distance', 'calories', 'fastest'] as const) if (out[k] === undefined) delete out[k];
  return out;
};

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
 * reps. A distance: a faster time over the same distance, or further than ever. Calories: more.
 * A hold or an interval: longer. Only an existing record can be beaten, so the first time an
 * exercise is done is not a PR, and a tie is not one either.
 */
export const isRecord = (x: SetResult, before: Records): boolean => {
  if (loaded(x)) {
    const e = e1rm(x);
    return (!!before.heaviest && x.load! > before.heaviest.value) || (e !== undefined && !!before.e1rm && e > before.e1rm.value);
  }
  if (counted(x)) return !!before.reps && x.reps! > before.reps.value;
  if (distanced(x)) {
    const f = timed(x) ? before.fastest?.[distKey(x.meters!)] : undefined;
    return (!!f && x.seconds! < f.value) || (!!before.distance && x.meters! > before.distance.value);
  }
  if (burned(x)) return !!before.calories && x.calories! > before.calories.value;
  return held(x) && !!before.longest && x.seconds! > before.longest.value;
};

/**
 * A set ticked mid-session, as a PR: it beats the records standing before the session and every
 * set of the exercise already done in it, so the second set at a new top load is not a PR again.
 * A warm-up never is, nor is anything in the first session of an exercise.
 */
export const recordOnTick = (before: Records, earlier: SetResult[], x: SetResult): boolean => {
  if (before.sessions === 0 || !isWorking(x)) return false;
  const r = earlier.reduce((acc, e) => addSet(acc, e, ''), before);
  return isRecord(x, r);
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

/** A time worked: "45 s" under a minute, "1:05" from one. */
export const fmtDur = (sec: number) => {
  const t = Math.round(sec);
  return t < 60 ? `${t} s` : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/** "100 × 5", "14.5 kph", "12 reps", "500 m in 1:41", "20 cal", "1:00", or "" for a round with
 * nothing counted. A load or reps with a time adds it: "24 kg · 40 s". */
export const setLabel = (x: SetResult, unit = ''): string => {
  const time = x.seconds !== undefined && x.seconds > 0 ? fmtDur(x.seconds) : '';
  if (x.meters !== undefined) return `${num(x.meters)} m${time ? ` in ${time}` : ''}`;
  if (x.calories !== undefined) return `${num(x.calories)} cal${time ? ` in ${time}` : ''}`;
  let base = '';
  if (x.load !== undefined && x.reps !== undefined) base = `${num(x.load)} × ${num(x.reps)}`;
  else if (x.load !== undefined) base = `${num(x.load)}${unit ? ` ${unit}` : ''}`;
  else if (x.reps !== undefined) base = `${num(x.reps)} reps`;
  return base && time ? `${base} · ${time}` : base || time;
};

export { num as fmtNum };

/** A record set in one session: the exercise and its best set that beat the record standing before it. */
export interface SessionPR {
  exerciseKey: string;
  set: SetResult;
}

const sameSession = (a: SessionResult, b: SessionResult) => (a.id && b.id ? a.id === b.id : a.runsheetId === b.runsheetId && a.startedAt === b.startedAt);

/**
 * Records this session set, one per exercise: of the sets flagged as a PR by `exerciseHistory`
 * (against everything logged before it), the best one. Sessions after this one are ignored, so an
 * old session keeps the PRs it set at the time. `all` may or may not already hold `result`.
 */
export const sessionPRs = (result: SessionResult, all: SessionResult[]): SessionPR[] => {
  const upTo = [...all.filter(r => !sameSession(r, result) && r.startedAt <= result.startedAt), result];
  const out: SessionPR[] = [];
  for (const key of new Set(result.steps.map(s => s.exerciseKey))) {
    const mine = exerciseHistory(upTo, key).find(s => s.startedAt === result.startedAt && s.runsheetId === result.runsheetId);
    const prs = mine ? mine.sets.filter((_, i) => mine.prs[i]) : [];
    if (!prs.length) continue;
    const score = (x: SetResult) => e1rm(x) ?? x.load ?? x.reps ?? x.meters ?? x.calories ?? x.seconds ?? 0;
    out.push({ exerciseKey: key, set: prs.reduce((a, b) => (score(b) > score(a) ? b : a)) });
  }
  return out;
};
