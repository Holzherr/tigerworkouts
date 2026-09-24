import type { Block, ExerciseStep, Item, Runsheet, Step } from './model';

/**
 * Settings vs a new setup (specs/workout-settings.md).
 *
 * A setting is a number on a workout you do: the weight or speed, incline, reps or seconds, a rest's
 * length, a block's rounds or its AMRAP minutes. It is saved as *your settings for that workout*,
 * keyed by workout id and step (or block) id, and never changes the workout itself.
 *
 * Anything else — adding, removing or reordering, grouping, swapping an exercise for good,
 * renaming — is a new setup: on your own workout it saves in place, on anyone else's it becomes
 * your own version (private, `derivedFrom` the original).
 *
 * Ported one for one to ios/TigerWorkouts/Model/WorkoutSettings.swift.
 */

export interface StepSetting {
  /** Weight or speed, in the exercise's own unit. */
  target?: number;
  incline?: number;
  /** Reps, seconds, minutes, metres or calories — whatever the step's forMode counts. */
  forValue?: number;
  /** A rest's length. */
  seconds?: number;
  /** When it was set, so a session done after it can win (see withLastUsed). */
  at: string;
}

export interface BlockSetting {
  repeat?: number;
  /** AMRAP length or a for-time cap. */
  timeCapSec?: number;
  everySec?: number;
  restBetweenSec?: number;
}

export interface WorkoutSettings {
  /** Newest write wins when two devices disagree. An entry with nothing in it is a reset. */
  updatedAt: string;
  steps: Record<string, StepSetting>;
  blocks: Record<string, BlockSetting>;
}

/** Your settings for every workout you have changed, by workout id. */
export type SettingsMap = Record<string, WorkoutSettings>;

export type EditKind = 'none' | 'settings' | 'structure';

export interface SettingsChange {
  steps: Record<string, Omit<StepSetting, 'at'>>;
  blocks: Record<string, BlockSetting>;
}

const STEP_FIELDS = ['target', 'incline', 'forValue'] as const;
const BLOCK_FIELDS = ['repeat', 'timeCapSec', 'everySec', 'restBetweenSec'] as const;

const stepsOf = (items: Item[]): Step[] => items.flatMap(i => (i.kind === 'block' ? i.steps : i.kind === 'ref' ? [] : [i]));
const blocksOf = (items: Item[]): Block[] => items.filter((i): i is Block => i.kind === 'block');

/** A relative load ({ pct }) or a load factor is computed at run time and is not a setting. */
const numericTarget = (s: ExerciseStep) => s.target === undefined || typeof s.target === 'number';

/** The workout with every setting taken out: two workouts with the same shape differ only in numbers. */
export const shape = (r: Runsheet): string => {
  const step = (s: Step): Step => {
    if (s.kind === 'rest') return { ...s, seconds: 0 };
    const { incline: _i, forValue: _f, target, ...rest } = s;
    void _i;
    void _f;
    return { ...rest, forValue: 0, ...(numericTarget(s) ? {} : { target }) } as ExerciseStep;
  };
  const items = r.items.map((it): Item => {
    if (it.kind === 'block') {
      const { repeat: _r, timeCapSec: _t, everySec: _e, restBetweenSec: _b, ...rest } = it;
      void _r;
      void _t;
      void _e;
      void _b;
      return { ...rest, repeat: 0, steps: it.steps.map(step) } as Block;
    }
    return it.kind === 'ref' ? it : step(it);
  });
  const { public: _p, ...meta } = r;
  void _p;
  return stable({ ...meta, items });
};
/** JSON with keys sorted at every level, so two objects built in a different order compare equal. */
const stable = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .filter(k => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map(k => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
};

/** What an edit was: nothing, numbers only, or a change to the workout itself. */
export const classifyEdit = (before: Runsheet, after: Runsheet): EditKind => {
  if (shape(before) !== shape(after)) return 'structure';
  const c = settingsChange(before, after);
  return Object.keys(c.steps).length || Object.keys(c.blocks).length ? 'settings' : 'none';
};

/** The numbers that differ between two runsheets of the same shape, by step and block id. */
export const settingsChange = (before: Runsheet, after: Runsheet): SettingsChange => {
  const was = new Map(stepsOf(before.items).map(s => [s.id, s]));
  const steps: SettingsChange['steps'] = {};
  for (const s of stepsOf(after.items)) {
    const b = was.get(s.id);
    if (!b || b.kind !== s.kind) continue;
    if (s.kind === 'rest' && b.kind === 'rest') {
      if (s.seconds !== b.seconds) steps[s.id] = { seconds: s.seconds };
      continue;
    }
    if (s.kind !== 'exercise' || b.kind !== 'exercise' || s.exercise.key !== b.exercise.key) continue;
    const out: Omit<StepSetting, 'at'> = {};
    for (const f of STEP_FIELDS) {
      if (f === 'target' && (!numericTarget(s) || !numericTarget(b))) continue;
      if (s[f] !== b[f] && s[f] !== undefined) out[f] = s[f] as number;
    }
    if (Object.keys(out).length) steps[s.id] = out;
  }
  const wasBlock = new Map(blocksOf(before.items).map(b => [b.id, b]));
  const blocks: SettingsChange['blocks'] = {};
  for (const b of blocksOf(after.items)) {
    const o = wasBlock.get(b.id);
    if (!o) continue;
    const out: BlockSetting = {};
    for (const f of BLOCK_FIELDS) if (b[f] !== o[f] && b[f] !== undefined) out[f] = b[f];
    if (Object.keys(out).length) blocks[b.id] = out;
  }
  return { steps, blocks };
};

/** Fold a change into what was saved; a field set again is overwritten, the rest stay. */
export const withChange = (ws: WorkoutSettings | undefined, change: SettingsChange, at: string): WorkoutSettings => {
  const steps = { ...(ws?.steps ?? {}) };
  for (const [id, v] of Object.entries(change.steps)) steps[id] = { ...steps[id], ...v, at };
  const blocks = { ...(ws?.blocks ?? {}) };
  for (const [id, v] of Object.entries(change.blocks)) blocks[id] = { ...blocks[id], ...v };
  return { updatedAt: at, steps, blocks };
};

/** "Reset to original": an empty entry, kept so the reset reaches your other devices. */
export const cleared = (at: string): WorkoutSettings => ({ updatedAt: at, steps: {}, blocks: {} });

export const hasSettings = (ws: WorkoutSettings | undefined): ws is WorkoutSettings => !!ws && (Object.keys(ws.steps).length > 0 || Object.keys(ws.blocks).length > 0);

/** Two devices' settings: per workout, the newer write wins. */
export const mergeSettings = (a: SettingsMap = {}, b: SettingsMap = {}): SettingsMap => {
  const out: SettingsMap = { ...a };
  for (const [id, v] of Object.entries(b)) if (!out[id] || Date.parse(v.updatedAt) > Date.parse(out[id].updatedAt)) out[id] = v;
  return out;
};

/**
 * The workout with your settings on it. Rest lengths, reps and block rounds come only from here;
 * weight, speed and incline also come from what you used last time — withLastUsed decides between them.
 */
export const applySettings = (r: Runsheet, ws: WorkoutSettings | undefined): Runsheet => {
  if (!hasSettings(ws)) return r;
  const step = (s: Step): Step => {
    const v = ws.steps[s.id];
    if (!v) return s;
    if (s.kind === 'rest') return v.seconds !== undefined ? { ...s, seconds: v.seconds } : s;
    const next: ExerciseStep = { ...s };
    if (v.target !== undefined && numericTarget(s)) next.target = v.target;
    if (v.incline !== undefined) next.incline = v.incline;
    if (v.forValue !== undefined) next.forValue = v.forValue;
    return next;
  };
  return {
    ...r,
    items: r.items.map((it): Item => {
      if (it.kind === 'ref') return it;
      if (it.kind !== 'block') return step(it);
      const b = ws.blocks[it.id];
      return { ...it, ...(b ?? {}), steps: it.steps.map(step) };
    }),
  };
};

/**
 * A new setup on a workout you do not own: your own version of it, private until you share it.
 * `r` is what you were looking at — your numbers are in it, so the new version starts from them.
 */
export const newVersion = (r: Runsheet, original: Runsheet, opts: { id: string; creator: string }): Runsheet => ({
  ...r,
  id: opts.id,
  title: r.title === original.title ? `${original.title} (mine)` : r.title,
  creator: opts.creator,
  source: { title: original.title, url: original.source?.url, author: original.source?.author ?? original.creator, kind: 'user' },
  program: undefined,
  derivedFrom: original.id ?? original.title,
  public: false,
});
