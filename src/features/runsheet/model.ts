import type { WorkoutIcon } from '@/features/workouts/icon';
import { plural } from '@/shared/utils/ui-utils';
/**
 * Runsheet model: a workout is an ordered list of items. An item is a step (exercise or rest) or
 * a block (a named list of steps that repeats N times). Everything here is pure; components call
 * these and hand the new value back up.
 */

/**
 * max = as many reps / as long a hold as possible (forValue ignored, the result is the score).
 * amrap = at least forValue reps, then as many as possible ("5+" sets in 5/3/1 and GreySkull).
 * segment = a stretch of a follow-along video from startSeconds to endSeconds; no timer of ours.
 */
export type ForMode = 'seconds' | 'reps' | 'minutes' | 'meters' | 'calories' | 'max' | 'amrap' | 'segment';

/** What a workout (or block) is scored on. time = for time; rounds = AMRAP rounds + reps; reps = total reps; load = heaviest lift; distance = metres covered. */
export type ScoreType = 'time' | 'rounds' | 'reps' | 'load' | 'distance' | 'none';

/** Where an item sits in the session; the list shows dividers between parts. */
export type ItemRole = 'warmup' | 'main' | 'cooldown';

/** Rule for the next session, from the programs: add on success, deload after repeated failure. */
export interface Progression {
  /** kg added to `target` when every set hit its reps (upper body vs lower body handled by the program author). */
  onSuccessKg?: number;
  /** Percent taken off after `failAfter` consecutive failed sessions. */
  deloadPct?: number;
  failAfter?: number;
  /** For amrap sets: reps at or above which the training max goes up by `tmBumpKg`. */
  amrapBumpAt?: number;
  tmBumpKg?: number;
}

/** How a block is run. rounds = repeat N times; fortime = N rounds, clock counts up, optional cap;
 *  amrap = as many rounds as possible in timeCapSec; emom = start the steps every everySec, N times. */
export type BlockMode = 'rounds' | 'fortime' | 'amrap' | 'emom' | 'ladder';

export interface Video {
  provider: 'youtube';
  id: string;
  url: string;
}

export interface Source {
  title: string;
  url?: string;
  author?: string;
  kind: 'benchmark' | 'coach' | 'program' | 'video' | 'article' | 'protocol' | 'user';
  license?: string;
  importedAt?: string;
}

export interface ExerciseRef {
  key: string;
  name: string;
  /** Unit of the target value: "kg", "kg per arm", "kph", "" for bodyweight. */
  unit: string;
  /** Stepper increment for the target. */
  step: number;
  clip?: string;
  poster?: string;
  icon?: string;
  /** One-line coaching cue shown in the timer. */
  cue?: string;
}

export interface ExerciseStep {
  kind: 'exercise';
  id: string;
  exercise: ExerciseRef;
  /** Weight, speed, etc. Undefined for bodyweight. */
  target?: number;
  forMode: ForMode;
  forValue: number;
  /** Upper bound when the source gives a range ("15 to 24 reps"). */
  forMax?: number;
  /** Do the reps/time on each side (lunges, single-arm rows). The timer doubles it. */
  perSide?: boolean;
  /** Load as a multiple of bodyweight (Linda: 1.5) or a percent of a training max (nSuns: 65). One of these instead of target. */
  loadFactor?: number;
  targetPct?: number;
  incline?: number;
  /** Prescribed loads when the source gives men's / women's Rx, in the exercise unit. */
  rx?: { men?: number; women?: number };
  /** Video timestamps when the workout is a follow-along; endSeconds only for segments. */
  startSeconds?: number;
  endSeconds?: number;
  /** Ladder blocks: multiply the rung by this (double-unders 10n), or keep the step fixed. */
  ladderFactor?: number;
  ladderFixed?: boolean;
  /** Per-set prescription, indexed by round: a pyramid or ramping sets give each set its own load or
   * reps. A value left out carries the one before it, and the first set falls back to target /
   * forValue. Only read in a rounds block. */
  sets?: SetPlan[];
  role?: ItemRole;
  note?: string;
}

/**
 * What a set is for. normal = a working set. warmup = lighter, before the work: left out of records,
 * volume, stalls and targets. drop = straight on from the set before at a lighter load, no rest and
 * no set number of its own. failure = a working set taken to failure. Unset means normal.
 */
export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';

/** The order a tap on the set number goes through. */
export const SET_TYPES: SetType[] = ['normal', 'warmup', 'drop', 'failure'];
export const SET_TYPE_LABEL: Record<SetType, string> = { normal: 'Normal', warmup: 'Warm-up', drop: 'Drop set', failure: 'Failure' };
/** The next type in the cycle W / 1 / D / F. */
export const nextSetType = (t: SetType | undefined): SetType => SET_TYPES[(SET_TYPES.indexOf(t ?? 'normal') + 1) % SET_TYPES.length];

/**
 * What each row's number shows: W for a warm-up, D for a drop set, F for a set to failure, and a
 * running count of the normal sets otherwise — a drop set is part of the set before it, so it is
 * not a new number.
 */
export const setMarks = (types: (SetType | undefined)[]): string[] => {
  let n = 0;
  return types.map(t => (t === 'warmup' ? 'W' : t === 'drop' ? 'D' : t === 'failure' ? 'F' : String(++n)));
};

/** One prescribed set. `reps` stands in for forValue (the count, or the seconds of a timed set). */
export interface SetPlan {
  reps?: number;
  load?: number;
  /** Unset for a normal set. Never carried to the sets after it, unlike reps and load. */
  type?: SetType;
}

export interface RestStep {
  kind: 'rest';
  id: string;
  seconds: number;
  role?: ItemRole;
  note?: string;
}

export type Step = ExerciseStep | RestStep;

export interface Block {
  kind: 'block';
  id: string;
  name: string;
  /** Rounds (rounds / fortime / emom). Ignored for amrap. */
  repeat: number;
  mode?: BlockMode;
  /** amrap length, or the cap on a fortime block. */
  timeCapSec?: number;
  /** emom interval, default 60. */
  everySec?: number;
  /** ladder rep scheme (21-15-9): each rung runs the steps with forValue scaled to the rung. */
  ladder?: number[];
  /** Rest between repeats of the block (The Chief: 3 min AMRAP, 1 min rest, ×5). Not after the last. */
  restBetweenSec?: number;
  score?: ScoreType;
  progression?: Progression;
  role?: ItemRole;
  note?: string;
  steps: Step[];
}

/** Another runsheet embedded by id (a shared warm-up); resolved before use with resolveRefs(). */
export interface RefItem {
  kind: 'ref';
  id: string;
  runsheetId: string;
  role?: ItemRole;
}

export type Item = Step | Block | RefItem;

export interface Runsheet {
  id?: string;
  title: string;
  creator?: string;
  description?: string;
  source?: Source;
  tags?: string[];
  level?: 'Easy' | 'Medium' | 'Hard';
  /** Set when the workout is one day of a multi-day program. */
  program?: { name: string; day: string; order?: number };
  /** One clock for the whole workout: blocks run back to back and the cap applies to all of them. */
  timeCapSec?: number;
  score?: ScoreType;
  progression?: Progression;
  video?: Video;
  /** Card icon: monogram on a gradient (default, derived from id) or an uploaded image. */
  icon?: WorkoutIcon;
  /** On the creator's public page and in everyone's Discover. New workouts are private. */
  public?: boolean;
  /** Who owns it, filled in when read from the cloud; never saved into the workout itself. */
  ownerId?: string;
  /** Set on the silent copy made when someone else's workout is edited: the id it was copied from.
   * Its sessions stay this workout's history, so Up next, pace and stalls keep the thread. */
  copyOf?: string;
  items: Item[];
}

/**
 * The silent copy made when a workout you do not own is edited and saved. It keeps the program
 * day and every step id, and remembers what it was copied from, so the sessions already logged
 * against the original still count as its history (Up next, last time, pace, stalls). Private.
 */
export const editedCopy = (edited: Runsheet, original: Runsheet, id: string, creator: string): Runsheet => ({
  ...edited,
  id,
  creator,
  source: { title: edited.title, url: edited.source?.url, author: edited.source?.author ?? edited.creator, kind: 'user' },
  program: original.program,
  copyOf: original.copyOf ?? original.id ?? original.title,
  public: false,
  ownerId: undefined,
});

/** The first edit of a workout you do not own: your copy, "(mine)" as on the phone. One copy per
 * original: when `mine` holds one already, that copy takes this edit under its own id. */
export const copyOnEdit = (edited: Runsheet, original: Runsheet, mine: Runsheet[], newId: string, creator: string): Runsheet => {
  const had = mine.find(w => w.copyOf === (original.copyOf ?? original.id ?? original.title));
  const title = edited.title.endsWith(' (mine)') ? edited.title : `${edited.title} (mine)`;
  return { ...editedCopy({ ...edited, title }, original, had?.id ?? newId, creator), icon: had?.icon ?? edited.icon };
};

/** The ids a workout's sessions are logged under: its own, and the one it was copied from. */
export const lineage = (r: Pick<Runsheet, 'id' | 'title' | 'copyOf'>): string[] => [r.id ?? r.title, ...(r.copyOf ? [r.copyOf] : [])];
/** A test for "this session was a run of this workout (or of the workout it was copied from)". */
export const ofWorkout = (r: Pick<Runsheet, 'id' | 'title' | 'copyOf'>) => {
  const ids = lineage(r);
  return (x: { runsheetId: string }) => ids.includes(x.runsheetId);
};

let seq = 0;
export const uid = (prefix = 's') => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`;

// ── constructors ──
export const makeRest = (seconds = 30): RestStep => ({ kind: 'rest', id: uid('r'), seconds });
export const makeExercise = (exercise: ExerciseRef, init: Partial<Omit<ExerciseStep, 'kind' | 'id' | 'exercise'>> = {}): ExerciseStep => ({
  kind: 'exercise',
  id: uid('e'),
  exercise,
  target: exercise.unit ? (init.target ?? defaultTarget(exercise)) : undefined,
  forMode: init.forMode ?? 'seconds',
  forValue: init.forValue ?? 30,
  incline: init.incline,
});
const defaultTarget = (ex: ExerciseRef) => (ex.unit === 'kph' ? 10 : ex.step * 4);

/** A new empty block at the end, named for its place: Add block on the workout page (iOS `Edit.addBlock`). */
export const addBlock = (items: Item[]): { items: Item[]; blockId: string } => {
  const block: Block = { kind: 'block', id: uid('b'), name: `Block ${items.filter(i => i.kind === 'block').length + 1}`, repeat: 8, mode: 'rounds', steps: [] };
  return { items: [...items, block], blockId: block.id };
};

// ── timing ──
/** Seconds a step takes on the timer. Reps have no clock; assume 3s per rep for estimates. */
export const stepSeconds = (s: Step): number => {
  if (s.kind === 'rest') return s.seconds;
  if (s.forMode === 'seconds') return s.forValue;
  if (s.forMode === 'minutes') return s.forValue * 60;
  if (s.forMode === 'meters') return s.forValue * 0.3; // ~2 min per 400 m
  if (s.forMode === 'calories') return s.forValue * 4;
  if (s.forMode === 'max') return 60;
  if (s.forMode === 'segment') return Math.max(0, (s.endSeconds ?? s.startSeconds ?? 0) - (s.startSeconds ?? 0)) || 60;
  return s.forValue * 3 * (s.perSide ? 2 : 1);
};
/** A ladder block's steps for one rung: reps replaced by the rung value (rests untouched). */
export const rungSteps = (b: Block, rung: number): Step[] =>
  b.steps.map(st => (st.kind === 'exercise' && st.forMode === 'reps' && !st.ladderFixed ? { ...st, forValue: Math.round(rung * (st.ladderFactor ?? 1)) } : st));
export const roundSeconds = (b: Block) => b.steps.reduce((t, s) => t + stepSeconds(s), 0);
export const blockSeconds = (b: Block) => {
  const mode = b.mode ?? 'rounds';
  const between = (b.restBetweenSec ?? 0) * Math.max(0, b.repeat - 1);
  if (mode === 'amrap') return (b.timeCapSec ?? roundSeconds(b) * b.repeat) + (b.restBetweenSec ? between : 0);
  if (mode === 'emom') return (b.everySec ?? 60) * b.repeat;
  if (mode === 'ladder') return (b.ladder ?? []).reduce((t, r) => t + rungSteps(b, r).reduce((u, st) => u + stepSeconds(st), 0), 0) + (b.restBetweenSec ?? 0) * Math.max(0, (b.ladder?.length ?? 1) - 1);
  const est = roundSeconds(b) * b.repeat + between;
  return mode === 'fortime' && b.timeCapSec ? Math.min(est, b.timeCapSec) : est;
};
export const itemSeconds = (i: Item) => (i.kind === 'block' ? blockSeconds(i) : i.kind === 'ref' ? 0 : stepSeconds(i));
export const runsheetSeconds = (r: Pick<Runsheet, 'items' | 'timeCapSec'>) => {
  const est = r.items.reduce((t, i) => t + itemSeconds(i), 0);
  return r.timeCapSec ? Math.min(est, r.timeCapSec) : est;
};

/** Inline every ref item using `lookup`; unknown refs are dropped. Items inherit the ref's role. */
export const resolveRefs = (r: Runsheet, lookup: (id: string) => Runsheet | undefined, depth = 0): Runsheet => ({
  ...r,
  items: r.items.flatMap<Item>(it => {
    if (it.kind !== 'ref') return [it];
    const target = depth < 3 ? lookup(it.runsheetId) : undefined;
    if (!target) return [];
    return resolveRefs(target, lookup, depth + 1).items.map(x => (x.kind === 'ref' ? x : { ...x, role: it.role ?? x.role, id: `${it.id}:${x.id}` }));
  }),
});

/** The score a runsheet is judged on: explicit, else from its main block's mode. */
export const scoreType = (r: Runsheet): ScoreType => {
  if (r.score) return r.score;
  const blocks = r.items.filter((i): i is Block => i.kind === 'block' && (i.role ?? 'main') === 'main');
  const b = blocks[0];
  if (b?.score) return b.score;
  if (!b) return 'none';
  const mode = b.mode ?? 'rounds';
  if (mode === 'fortime' || mode === 'ladder') return 'time';
  if (mode === 'amrap') return 'rounds';
  if (b.steps.some(s => s.kind === 'exercise' && (s.forMode === 'max' || s.forMode === 'amrap'))) return 'reps';
  return 'none';
};
export const runsheetMinutes = (r: Pick<Runsheet, 'items'>) => Math.round(runsheetSeconds(r) / 60);

// ── straight sets ──
/** A block that is one exercise done for N sets, rests allowed: shown and run as a set grid. The
 * exercise has to be done to a count or carry a load — 8 × 20 s of squats in a Tabata is an
 * interval, not sets, and keeps the countdown. */
export const straightSetStep = (b: Block): ExerciseStep | undefined => {
  if ((b.mode ?? 'rounds') !== 'rounds') return undefined;
  const ex = b.steps.filter((s): s is ExerciseStep => s.kind === 'exercise');
  const s = ex.length === 1 ? ex[0] : undefined;
  return s && (s.forMode === 'reps' || s.forMode === 'amrap' || s.forMode === 'max' || s.target !== undefined) ? s : undefined;
};
/** The set a round asks for: its own values, else the latest set before it that has one, else the step's. */
export const plannedSet = (s: ExerciseStep, round: number): { reps: number; load?: number } => {
  let reps: number | undefined;
  let load: number | undefined;
  for (let i = Math.min(round, (s.sets?.length ?? 0) - 1); i >= 0 && (reps === undefined || load === undefined); i--) {
    reps ??= s.sets![i]?.reps;
    load ??= s.sets![i]?.load;
  }
  return { reps: reps ?? s.forValue, load: load ?? s.target };
};
/** Change one set of a straight-set block. Every set is written out with what it showed first, so
 * the edit changes that row and no other. */
export const editSet = (b: Block, round: number, patch: SetPlan): Block => {
  const step = straightSetStep(b);
  if (!step) return b;
  const sets: SetPlan[] = Array.from({ length: Math.max(b.repeat, step.sets?.length ?? 0) }, (_, i) => {
    const p = plannedSet(step, i);
    const type = step.sets?.[i]?.type;
    return { reps: p.reps, ...(p.load !== undefined ? { load: p.load } : {}), ...(type && type !== 'normal' ? { type } : {}) };
  });
  sets[round] = { ...sets[round], ...patch };
  if (sets[round].type === 'normal' || sets[round].type === undefined) delete sets[round].type;
  return { ...b, steps: b.steps.map(s => (s.id === step.id ? { ...step, sets } : s)) };
};
/** The type of one planned set; normal when the plan says nothing. */
export const plannedType = (s: ExerciseStep, round: number): SetType => s.sets?.[round]?.type ?? 'normal';

/** One more set, a copy of the last one; the block repeats once more. */
export const addSet = (b: Block): Block => {
  const step = straightSetStep(b);
  if (!step) return b;
  const last = plannedSet(step, b.repeat - 1);
  const sets: SetPlan[] = Array.from({ length: b.repeat }, (_, i) => ({ ...step.sets?.[i] }));
  sets.push({ reps: last.reps, ...(last.load !== undefined ? { load: last.load } : {}) });
  return { ...b, repeat: b.repeat + 1, steps: b.steps.map(s => (s.id === step.id ? { ...step, sets } : s)) };
};
/** Drop the last set. A block keeps at least one. */
export const removeSet = (b: Block): Block => {
  const step = straightSetStep(b);
  if (!step || b.repeat <= 1) return b;
  const repeat = b.repeat - 1;
  const next: ExerciseStep = { ...step, sets: step.sets?.slice(0, repeat) };
  if (!next.sets?.length) delete next.sets;
  return { ...b, repeat, steps: b.steps.map(s => (s.id === step.id ? next : s)) };
};

/** The set grid has a load column: a unit to count it in, and either an absolute load or a relative
 * one (% of a training max, × bodyweight) already resolved into `target` by `resolveLoads`. */
export const showsLoad = (s: ExerciseStep) => !!s.exercise.unit && (s.target !== undefined || (s.loadFactor === undefined && s.targetPct === undefined));

/** An exercise whose unit is the measure of the work — a rower in metres, a plank in seconds, a bike
 * in calories — rather than a load. Its `target` is not a weight in hand. */
export const measureOf = (unit: string | undefined): 'meters' | 'seconds' | 'calories' | undefined => (unit === 'm' ? 'meters' : unit === 's' ? 'seconds' : unit === 'cal' ? 'calories' : undefined);

/** Column heading for the per-set count; undefined for modes with nothing to count per set. */
export const countLabel = (m: ForMode): string | undefined =>
  m === 'reps' || m === 'amrap' ? 'Reps' : m === 'seconds' ? 'Sec' : m === 'minutes' ? 'Min' : m === 'meters' ? 'm' : m === 'calories' ? 'Cal' : undefined;

// ── labels ──
export const shortUnit = (unit: string) => unit.replace(' per arm', '').replace(' per side', '').trim();
export const forLabel = (s: ExerciseStep) => {
  const n = s.forMax ? `${s.forValue}–${s.forMax}` : `${s.forValue}`;
  const base = s.forMode === 'max' ? 'max' : s.forMode === 'amrap' ? `${s.forValue}+ reps` : s.forMode === 'segment' ? (s.startSeconds !== undefined ? `from ${fmtClockLocal(s.startSeconds)}` : 'follow along') : s.forMode === 'seconds' ? `${n}s` : s.forMode === 'minutes' ? `${n} min` : s.forMode === 'meters' ? `${n} m` : s.forMode === 'calories' ? `${n} cal` : `${n} reps`;
  return s.perSide ? `${base} each side` : base;
};
const fmtClockLocal = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
/** "43 kg", "1.5× BW", "65% TM" or empty for bodyweight. */
export const loadLabel = (s: ExerciseStep) => (s.loadFactor ? `${s.loadFactor}× BW` : s.targetPct ? `${s.targetPct}% TM` : s.target !== undefined ? `${s.target % 1 ? s.target.toFixed(1) : s.target} ${shortUnit(s.exercise.unit)}` : '');
/** "×8", "AMRAP 20:00", "EMOM 10", "5 rounds for time" */
export const modeLabel = (b: Block) => {
  const mode = b.mode ?? 'rounds';
  if (mode === 'amrap') {
    // A block with no time set reads AMRAP, not AMRAP 0:00; 90 s reads 1:30.
    const t = b.timeCapSec ?? 0;
    return t > 0 ? `AMRAP ${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}` : 'AMRAP';
  }
  if (mode === 'emom') return `EMOM ${b.repeat}`;
  if (mode === 'fortime') return `${b.repeat} round${b.repeat === 1 ? '' : 's'} for time`;
  if (mode === 'ladder') return (b.ladder ?? []).join('-');
  return `×${b.repeat}`;
};
/** What a block runs, in words, for the timer's gate and overview: "3 rounds", "1 round for time",
 * "AMRAP · 12 min", "EMOM · 10 minutes", "21-15-9". */
export const roundsLabel = (b: Block): string => {
  const mode = b.mode ?? 'rounds';
  if (mode === 'amrap') return `AMRAP${b.timeCapSec ? ` · ${Math.round(b.timeCapSec / 60)} min` : ''}`;
  if (mode === 'emom') {
    const every = b.everySec ?? 60;
    return `EMOM · ${every === 60 ? plural(b.repeat, 'minute') : `${b.repeat} × ${every % 60 === 0 ? `${every / 60} min` : `${every} s`}`}`;
  }
  if (mode === 'ladder') return (b.ladder ?? [b.repeat]).join('-');
  return `${plural(b.repeat, 'round')}${mode === 'fortime' ? ' for time' : ''}`;
};
export const ROLE_LABEL: Record<ItemRole, string> = { warmup: 'Warm-up', main: 'Workout', cooldown: 'Cool-down' };
/** Default block name: exercise names joined with " + ". */
export const autoBlockName = (steps: Step[]) => {
  const names = steps.filter((s): s is ExerciseStep => s.kind === 'exercise').map(s => s.exercise.name);
  return names.length ? [...new Set(names)].join(' + ') : 'Block';
};

// ── lookup ──
export interface Path {
  itemIndex: number;
  /** Set when the step lives inside a block. */
  stepIndex?: number;
}
export const findStep = (items: Item[], id: string): Path | null => {
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.id === id) return { itemIndex: i };
    if (it.kind === 'ref') continue;
    if (it.kind === 'block') {
      const j = it.steps.findIndex(s => s.id === id);
      if (j >= 0) return { itemIndex: i, stepIndex: j };
    }
  }
  return null;
};
export const getStep = (items: Item[], id: string): Step | null => {
  const p = findStep(items, id);
  if (!p) return null;
  const it = items[p.itemIndex];
  if (it.kind === 'block') return p.stepIndex === undefined ? null : it.steps[p.stepIndex];
  return it.kind === 'ref' ? null : it;
};
export const blockOf = (items: Item[], stepId: string): Block | null => {
  const p = findStep(items, stepId);
  if (!p || p.stepIndex === undefined) return null;
  return items[p.itemIndex] as Block;
};

// ── edits (all return new arrays) ──
export const replaceStep = (items: Item[], id: string, next: Step): Item[] =>
  items.map(it => {
    if (it.id === id) return next;
    if (it.kind === 'block' && it.steps.some(s => s.id === id)) return { ...it, steps: it.steps.map(s => (s.id === id ? next : s)) };
    return it;
  });

export const updateBlock = (items: Item[], id: string, patch: Partial<Pick<Block, 'name' | 'repeat' | 'mode' | 'timeCapSec' | 'everySec' | 'note' | 'ladder' | 'restBetweenSec' | 'role' | 'score'>>): Item[] =>
  items.map(it => (it.id === id && it.kind === 'block' ? { ...it, ...patch } : it));

/** Remove a step. A block left with one step dissolves into that step; with none, it disappears. */
export const removeStep = (items: Item[], id: string): Item[] =>
  items.flatMap(it => {
    if (it.id === id) return [];
    if (it.kind !== 'block' || !it.steps.some(s => s.id === id)) return [it];
    const steps = it.steps.filter(s => s.id !== id);
    if (steps.length === 0) return [];
    if (steps.length === 1) return [steps[0]];
    return [{ ...it, steps }];
  });

export const removeItem = (items: Item[], id: string): Item[] => (findStep(items, id)?.stepIndex === undefined ? items.filter(it => it.id !== id) : removeStep(items, id));

/** Insert a step after `anchorId`. Anchor inside a block → inside that block. Anchor = block id → first in that block. null → at the end. */
export const insertAfter = (items: Item[], anchorId: string | null, step: Step): Item[] => {
  if (anchorId === null) return [...items, step];
  const p = findStep(items, anchorId);
  if (!p) return [...items, step];
  const it = items[p.itemIndex];
  if (it.kind === 'block') {
    const steps = [...it.steps];
    steps.splice(p.stepIndex === undefined ? 0 : p.stepIndex + 1, 0, step);
    return items.map((x, i) => (i === p.itemIndex ? { ...it, steps } : x));
  }
  const out = [...items];
  if (it.kind !== 'ref') step = { ...step, role: it.role };
  out.splice(p.itemIndex + 1, 0, step);
  return out;
};

/** Append a step at the end of a block. */
export const appendToBlock = (items: Item[], blockId: string, step: Step): Item[] => items.map(it => (it.id === blockId && it.kind === 'block' ? { ...it, steps: [...it.steps, step] } : it));

/**
 * Drop `draggedId` onto `targetId`.
 * Target is a loose step → both become a new block (rest inserted between if neither is a rest).
 * Target is inside a block, or is a block → dragged joins that block at the end.
 */
export const groupOnto = (items: Item[], draggedId: string, targetId: string, opts: { autoRest?: number } = {}): Item[] => {
  const dragged = getStep(items, draggedId);
  if (!dragged || draggedId === targetId) return items;
  const without = removeStep(items, draggedId);
  const tp = findStep(without, targetId);
  if (!tp) return items;
  const target = without[tp.itemIndex];
  if (target.kind === 'ref') return items;
  if (target.kind === 'block') return appendToBlock(without, target.id, dragged);
  const between = opts.autoRest && dragged.kind === 'exercise' && target.kind === 'exercise' ? [makeRest(opts.autoRest)] : [];
  const steps = [target, ...between, dragged];
  const block: Block = { kind: 'block', id: uid('b'), name: autoBlockName(steps), repeat: 2, steps };
  return without.map((x, i) => (i === tp.itemIndex ? block : x));
};

/**
 * Loose steps become rounds: the run of top-level steps that are not warm-up or cool-down is
 * wrapped into one block, so it gets a Rounds stepper. The visible way to make a circuit; the
 * hold-to-group gesture is the hidden one.
 */
export const repeatAsRounds = (items: Item[], repeat = 3): { items: Item[]; blockId: string | null } => {
  const loose = (it: Item): it is Step => (it.kind === 'exercise' || it.kind === 'rest') && (it.role ?? 'main') === 'main';
  const start = items.findIndex(loose);
  if (start < 0) return { items, blockId: null };
  let end = start;
  while (end + 1 < items.length && loose(items[end + 1])) end++;
  const steps = items.slice(start, end + 1) as Step[];
  const block: Block = { kind: 'block', id: uid('b'), name: autoBlockName(steps), repeat, mode: 'rounds', steps };
  return { items: [...items.slice(0, start), block, ...items.slice(end + 1)], blockId: block.id };
};

/**
 * The first step of an empty workout starts a block, so rounds are there from the start instead of
 * a loose step with nowhere to set them. Warm-up and cool-down items do not count as a start.
 */
export const isEmptyMain = (items: Item[]) => !items.some(it => it.kind !== 'ref' && (it.role ?? 'main') === 'main');
export const startBlock = (items: Item[], step: Step, repeat = 3): { items: Item[]; blockId: string } => {
  const block: Block = { kind: 'block', id: uid('b'), name: autoBlockName([step]), repeat, mode: 'rounds', steps: [step] };
  return { items: [...items, block], blockId: block.id };
};

// ── flat row view for drag-and-drop ──
export type Row = { type: 'step'; id: string; step: Step; blockId?: string } | { type: 'block-head'; id: string; block: Block } | { type: 'block-end'; id: string; blockId: string } | { type: 'ref'; id: string; ref: RefItem };

export const flatten = (items: Item[]): Row[] =>
  items.flatMap<Row>(it =>
    it.kind === 'block'
      ? [{ type: 'block-head', id: it.id, block: it }, ...it.steps.map<Row>(s => ({ type: 'step', id: s.id, step: s, blockId: it.id })), { type: 'block-end', id: `${it.id}:end`, blockId: it.id }]
      : it.kind === 'ref'
        ? [{ type: 'ref', id: it.id, ref: it }]
        : [{ type: 'step', id: it.id, step: it }]
  );

/** Rebuild items from rows; a block with fewer than two steps dissolves, unless `keep` holds it. */
export const rebuild = (rows: Row[], keep?: (b: Block) => boolean): Item[] => {
  const out: Item[] = [];
  let open: { block: Block; steps: Step[] } | null = null;
  for (const r of rows) {
    if (r.type === 'ref') out.push(r.ref);
    else if (r.type === 'block-head') open = { block: r.block, steps: [] };
    else if (r.type === 'block-end') {
      if (open) {
        if (open.steps.length >= 2 || keep?.(open.block)) out.push({ ...open.block, steps: open.steps });
        else out.push(...open.steps);
      }
      open = null;
    } else if (open) open.steps.push(r.step);
    else out.push(r.step);
  }
  if (open) out.push(...open.steps);
  return out;
};

/**
 * Move the row `activeId` so that it lands at `overId`'s position (before it when moving up,
 * after it when moving down, like a sortable list). Block heads carry their whole block.
 */
/** Remove the active row (a block moves as a chunk) and return the remaining rows plus the chunk. */
const liftRow = (items: Item[], activeId: string): { chunk: Row[]; rest: Row[]; active: Row } | null => {
  const rows = flatten(items);
  const from = rows.findIndex(r => r.id === activeId);
  if (from < 0) return null;
  const active = rows[from];
  const chunkLen = active.type === 'block-head' ? rows.findIndex(r => r.type === 'block-end' && r.blockId === active.id) - from + 1 : 1;
  return { chunk: rows.slice(from, from + chunkLen), rest: [...rows.slice(0, from), ...rows.slice(from + chunkLen)], active };
};
const placeRow = (lift: NonNullable<ReturnType<typeof liftRow>>, insertAt: number): Item[] => {
  const { chunk, rest, active } = lift;
  let at = Math.max(0, Math.min(rest.length, insertAt));
  if (active.type === 'block-head') {
    let depth = 0;
    for (let i = 0; i < at; i++) {
      if (rest[i].type === 'block-head') depth++;
      if (rest[i].type === 'block-end') depth--;
    }
    if (depth > 0) {
      while (at < rest.length && rest[at].type !== 'block-end') at++;
      at++;
    }
  }
  rest.splice(at, 0, ...chunk);
  return rebuild(rest, untouched(active));
};
/** Only the block a step was dragged out of can dissolve: a one-set block or a new empty one
 * elsewhere in the list stays a block, as on the phone. */
const untouched = (active: Row) => (b: Block) => active.type !== 'step' || active.blockId !== b.id;
/** Put the active row immediately before or after a specific row (a block's `:end` row = just after that block). */
export const moveRowTo = (items: Item[], activeId: string, rowId: string, where: 'before' | 'after'): Item[] => {
  if (activeId === rowId) return items;
  const lift = liftRow(items, activeId);
  if (!lift) return items;
  const idx = lift.rest.findIndex(r => r.id === rowId);
  if (idx < 0) return items;
  return placeRow(lift, where === 'after' ? idx + 1 : idx);
};
/** Put the active row at the top level, after item `afterId` (null = first). */
export const moveToTopLevel = (items: Item[], activeId: string, afterId: string | null): Item[] => {
  const lift = liftRow(items, activeId);
  if (!lift) return items;
  if (afterId === null) return placeRow(lift, 0);
  const it = items.find(x => x.id === afterId);
  const endId = it?.kind === 'block' ? `${afterId}:end` : afterId;
  const idx = lift.rest.findIndex(r => r.id === endId);
  if (idx < 0) return items;
  return placeRow(lift, idx + 1);
};

export const moveRow = (items: Item[], activeId: string, overId: string): Item[] => {
  if (activeId === overId) return items;
  const rows = flatten(items);
  const from = rows.findIndex(r => r.id === activeId);
  const to = rows.findIndex(r => r.id === overId);
  if (from < 0 || to < 0) return items;
  const active = rows[from];
  // a block moves as a chunk (head … end)
  const chunkLen = active.type === 'block-head' ? rows.findIndex(r => r.type === 'block-end' && r.blockId === active.id) - from + 1 : 1;
  const chunk = rows.slice(from, from + chunkLen);
  const rest = [...rows.slice(0, from), ...rows.slice(from + chunkLen)];
  let insertAt = rest.findIndex(r => r.id === overId);
  if (insertAt < 0) return items;
  if (to > from) insertAt += 1;
  // a block can't land inside another block
  if (active.type === 'block-head') {
    let depth = 0;
    for (let i = 0; i < insertAt; i++) {
      if (rest[i].type === 'block-head') depth++;
      if (rest[i].type === 'block-end') depth--;
    }
    if (depth > 0) {
      // push it out to after that block
      while (insertAt < rest.length && rest[insertAt].type !== 'block-end') insertAt++;
      insertAt++;
    }
  }
  rest.splice(insertAt, 0, ...chunk);
  return rebuild(rest, untouched(active));
};

// ── legacy import (v0.9 data.js shapes) ──
interface LegacyEx {
  ex: string;
  target?: number;
  sets?: number;
  reps?: number;
}
interface LegacyBlock {
  name?: string;
  type: 'interval' | 'sets' | 'steady';
  work_s?: number;
  rest_s?: number;
  rounds?: number;
  exercises?: LegacyEx[];
  ex?: string;
  incline?: number;
  repeat?: number;
  segments?: { s: number; speed: number }[];
}
export interface LegacyWorkout {
  id: string;
  title: string;
  creator?: string;
  blocks: LegacyBlock[];
}

export const fromLegacy = (w: LegacyWorkout, lib: Record<string, ExerciseRef>): Runsheet => {
  const ref = (key: string): ExerciseRef => lib[key] ?? { key, name: key, unit: '', step: 1 };
  const items: Item[] = w.blocks.map(b => {
    if (b.type === 'steady') {
      const segs = b.segments ?? [];
      const mins = (segs.reduce((t, s) => t + s.s, 0) * (b.repeat ?? 1)) / 60;
      return makeExercise(ref(b.ex ?? ''), { forMode: 'minutes', forValue: Math.round(mins), target: segs[0]?.speed, incline: b.incline });
    }
    const steps: Step[] = [];
    const isSets = b.type === 'sets';
    for (const e of b.exercises ?? []) {
      steps.push(makeExercise(ref(e.ex), isSets ? { forMode: 'reps', forValue: e.reps ?? 10, target: e.target } : { forMode: 'seconds', forValue: b.work_s ?? 30, target: e.target }));
      if (b.rest_s) steps.push(makeRest(b.rest_s));
    }
    const repeat = isSets ? Math.max(1, ...(b.exercises ?? []).map(e => e.sets ?? 1)) : (b.rounds ?? 1);
    return { kind: 'block', id: uid('b'), name: b.name || autoBlockName(steps), repeat, steps };
  });
  return { id: w.id, title: w.title, creator: w.creator, items };
};
