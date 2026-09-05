/**
 * Runsheet model: a workout is an ordered list of items. An item is a step (exercise or rest) or
 * a block (a named list of steps that repeats N times). Everything here is pure; components call
 * these and hand the new value back up.
 */

export type ForMode = 'seconds' | 'reps' | 'minutes';

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
}

export interface ExerciseStep {
  kind: 'exercise';
  id: string;
  exercise: ExerciseRef;
  /** Weight, speed, etc. Undefined for bodyweight. */
  target?: number;
  forMode: ForMode;
  forValue: number;
  incline?: number;
}

export interface RestStep {
  kind: 'rest';
  id: string;
  seconds: number;
}

export type Step = ExerciseStep | RestStep;

export interface Block {
  kind: 'block';
  id: string;
  name: string;
  repeat: number;
  steps: Step[];
}

export type Item = Step | Block;

export interface Runsheet {
  id?: string;
  title: string;
  creator?: string;
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
  return s.forValue * 3;
};
export const roundSeconds = (b: Block) => b.steps.reduce((t, s) => t + stepSeconds(s), 0);
export const itemSeconds = (i: Item) => (i.kind === 'block' ? roundSeconds(i) * i.repeat : stepSeconds(i));
export const runsheetSeconds = (r: Pick<Runsheet, 'items'>) => r.items.reduce((t, i) => t + itemSeconds(i), 0);
export const runsheetMinutes = (r: Pick<Runsheet, 'items'>) => Math.round(runsheetSeconds(r) / 60);

// ── labels ──
export const shortUnit = (unit: string) => unit.replace(' per arm', '').replace(' per side', '').trim();
export const forLabel = (s: ExerciseStep) => (s.forMode === 'seconds' ? `${s.forValue}s` : s.forMode === 'minutes' ? `${s.forValue} min` : `${s.forValue} reps`);
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
  return it;
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

export const updateBlock = (items: Item[], id: string, patch: Partial<Pick<Block, 'name' | 'repeat'>>): Item[] =>
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
  if (target.kind === 'block') return appendToBlock(without, target.id, dragged);
  const between = opts.autoRest && dragged.kind === 'exercise' && target.kind === 'exercise' ? [makeRest(opts.autoRest)] : [];
  const steps = [target, ...between, dragged];
  const block: Block = { kind: 'block', id: uid('b'), name: autoBlockName(steps), repeat: 2, steps };
  return without.map((x, i) => (i === tp.itemIndex ? block : x));
};

// ── flat row view for drag-and-drop ──
export type Row = { type: 'step'; id: string; step: Step; blockId?: string } | { type: 'block-head'; id: string; block: Block } | { type: 'block-end'; id: string; blockId: string };

export const flatten = (items: Item[]): Row[] =>
  items.flatMap<Row>(it =>
    it.kind === 'block'
      ? [{ type: 'block-head', id: it.id, block: it }, ...it.steps.map<Row>(s => ({ type: 'step', id: s.id, step: s, blockId: it.id })), { type: 'block-end', id: `${it.id}:end`, blockId: it.id }]
      : [{ type: 'step', id: it.id, step: it }]
  );

/** Rebuild items from rows; a block with fewer than two steps dissolves. */
export const rebuild = (rows: Row[]): Item[] => {
  const out: Item[] = [];
  let open: { block: Block; steps: Step[] } | null = null;
  for (const r of rows) {
    if (r.type === 'block-head') open = { block: r.block, steps: [] };
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
