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
  kind: 'benchmark' | 'program' | 'video' | 'article' | 'protocol' | 'user';
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
  role?: ItemRole;
  note?: string;
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
  items: Item[];
}

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
  if (mode === 'amrap') return `AMRAP ${Math.round((b.timeCapSec ?? 0) / 60)}:00`;
  if (mode === 'emom') return `EMOM ${b.repeat}`;
  if (mode === 'fortime') return `${b.repeat} round${b.repeat === 1 ? '' : 's'} for time`;
  if (mode === 'ladder') return (b.ladder ?? []).join('-');
  return `×${b.repeat}`;
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

/** Rebuild items from rows; a block with fewer than two steps dissolves. */
export const rebuild = (rows: Row[]): Item[] => {
  const out: Item[] = [];
  let open: { block: Block; steps: Step[] } | null = null;
  for (const r of rows) {
    if (r.type === 'ref') out.push(r.ref);
    else if (r.type === 'block-head') open = { block: r.block, steps: [] };
    else if (r.type === 'block-end') {
      if (open) {
        if (open.steps.length >= 2) out.push({ ...open.block, steps: open.steps });
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
  return rebuild(rest);
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
