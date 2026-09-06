/**
 * The timer engine: expands a runsheet into slots (work, rest) and steps through them. Pure: every
 * transition takes `now` in ms so it can be tested without a clock. The React hook adds the
 * interval, sounds, wake lock and persistence.
 */
import { rungSteps, scoreType, type Block, type Runsheet, type Step } from '@/features/runsheet/model';
import type { SessionResult, StepResult } from '@/features/runsheet/progression';

export interface Slot {
  id: string;
  kind: 'work' | 'rest';
  step: Step;
  /** Countdown length. Undefined = user-paced (reps, max, distance), ends on Done. */
  seconds?: number;
  blockId?: string;
  blockName?: string;
  mode: 'loose' | 'rounds' | 'fortime' | 'amrap' | 'emom' | 'ladder';
  round: number;
  rounds: number;
  /** emom: the rest fills the minute; seconds is computed from the block start on entry. */
  untilBoundary?: boolean;
  everySec?: number;
  /** ladder rung value for the label. */
  rung?: number;
  /** amrap/fortime: the cap on the whole block, seconds. */
  capSec?: number;
}

export type Phase = 'ready' | 'lead' | 'running' | 'paused' | 'done';

export interface Actual {
  target?: number;
  reps?: number;
  changes: { atSec: number; target: number }[];
  doneAt?: number;
}

export interface RunState {
  runsheetId: string;
  title: string;
  slots: Slot[];
  i: number;
  phase: Phase;
  startedAt: number;
  endedAt?: number;
  /** When the current slot (or lead-in) started, ms. */
  slotStartedAt: number;
  /** Countdown end, ms; undefined for user-paced. */
  endsAt?: number;
  /** Remaining ms captured on pause. */
  remainingMs?: number;
  pausedMs: number;
  pausedAt?: number;
  actuals: Record<string, Actual>;
  dropped: string[];
  /** ms at which each block's first slot started, for caps and EMOM boundaries. */
  blockStart: Record<string, number>;
  /** Slots completed per block (for AMRAP scoring). */
  blockDone: Record<string, number>;
  leadSec: number;
}

const LEAD_SEC = 5;

const slotSeconds = (s: Step): number | undefined => {
  if (s.kind === 'rest') return s.seconds;
  if (s.forMode === 'seconds') return s.forValue;
  if (s.forMode === 'minutes') return s.forValue * 60;
  if (s.forMode === 'segment') return s.endSeconds !== undefined && s.startSeconds !== undefined ? s.endSeconds - s.startSeconds : undefined;
  return undefined;
};

const estimate = (s: Step) => slotSeconds(s) ?? (s.kind === 'exercise' ? (s.forValue || 10) * 3 : 30);

/** Expand a runsheet into the ordered slot list the timer walks. Dropped step ids are skipped. */
export const expand = (r: Runsheet, dropped: string[] = []): Slot[] => {
  const out: Slot[] = [];
  const skip = new Set(dropped);
  let n = 0;
  const push = (step: Step, extra: Partial<Slot> & Pick<Slot, 'mode' | 'round' | 'rounds'>) => {
    if (skip.has(step.id)) return;
    out.push({ id: `${step.id}#${n++}`, kind: step.kind === 'rest' ? 'rest' : 'work', step, seconds: slotSeconds(step), ...extra });
  };
  for (const it of r.items) {
    if (it.kind === 'ref') continue;
    if (it.kind !== 'block') {
      push(it, { mode: 'loose', round: 0, rounds: 1 });
      continue;
    }
    const b = it as Block;
    const mode = b.mode ?? 'rounds';
    const base = { blockId: b.id, blockName: b.name, mode } as const;
    const between = (round: number, rounds: number) => {
      if (b.restBetweenSec && round < rounds - 1) out.push({ id: `${b.id}:between#${n++}`, kind: 'rest', step: { kind: 'rest', id: `${b.id}:between`, seconds: b.restBetweenSec }, seconds: b.restBetweenSec, ...base, round, rounds });
    };
    if (mode === 'ladder') {
      const rungs = b.ladder ?? [b.repeat];
      rungs.forEach((rung, ri) => {
        for (const s of rungSteps(b, rung)) push(s, { ...base, round: ri, rounds: rungs.length, rung, capSec: b.timeCapSec });
        between(ri, rungs.length);
      });
      continue;
    }
    if (mode === 'emom') {
      const every = b.everySec ?? 60;
      for (let m = 0; m < b.repeat; m++) {
        for (const s of b.steps) if (s.kind === 'exercise') push(s, { ...base, round: m, rounds: b.repeat, everySec: every });
        out.push({ id: `${b.id}:wait#${n++}`, kind: 'rest', step: { kind: 'rest', id: `${b.id}:wait`, seconds: every }, seconds: every, untilBoundary: true, everySec: every, ...base, round: m, rounds: b.repeat });
      }
      continue;
    }
    const roundLen = b.steps.reduce((t, s) => t + estimate(s), 0);
    const rounds = mode === 'amrap' ? Math.max(1, Math.ceil((b.timeCapSec ?? 600) / Math.max(15, roundLen))) + 2 : Math.max(1, b.repeat);
    for (let ri = 0; ri < rounds; ri++) {
      for (const s of b.steps) push(s, { ...base, round: ri, rounds, capSec: mode === 'amrap' || mode === 'fortime' ? b.timeCapSec : undefined });
      between(ri, rounds);
    }
  }
  return out;
};

export const start = (r: Runsheet, now: number, dropped: string[] = []): RunState => ({
  runsheetId: r.id ?? r.title,
  title: r.title,
  slots: expand(r, dropped),
  i: 0,
  phase: 'lead',
  startedAt: now,
  slotStartedAt: now,
  endsAt: now + LEAD_SEC * 1000,
  pausedMs: 0,
  actuals: {},
  dropped,
  blockStart: {},
  blockDone: {},
  leadSec: LEAD_SEC,
});

export const current = (s: RunState): Slot | undefined => s.slots[s.i];
export const next = (s: RunState): Slot | undefined => s.slots[s.i + 1];

/** Seconds since the session started, excluding pauses. */
export const elapsed = (s: RunState, now: number) => Math.max(0, ((s.endedAt ?? (s.phase === 'paused' && s.pausedAt ? s.pausedAt : now)) - s.startedAt - s.pausedMs) / 1000);
/** Seconds left in the current countdown, or seconds elapsed in a user-paced slot (negative sign convention: returns {left} or {spent}). */
export const clock = (s: RunState, now: number): { left?: number; spent: number } => {
  if (s.phase === 'paused') return { left: s.remainingMs !== undefined ? s.remainingMs / 1000 : undefined, spent: ((s.pausedAt ?? now) - s.slotStartedAt) / 1000 };
  const spent = (now - s.slotStartedAt) / 1000;
  return { left: s.endsAt !== undefined ? Math.max(0, (s.endsAt - now) / 1000) : undefined, spent };
};
/** Seconds the current block has been running (for caps, fortime and amrap clocks). */
export const blockElapsed = (s: RunState, now: number) => {
  const c = current(s);
  if (!c?.blockId || s.blockStart[c.blockId] === undefined) return 0;
  const end = s.phase === 'paused' && s.pausedAt ? s.pausedAt : now;
  return Math.max(0, (end - s.blockStart[c.blockId] - pausedSince(s, s.blockStart[c.blockId])) / 1000);
};
// pauses are tracked globally; approximate per-block by ignoring pauses before the block started
const pausedSince = (s: RunState, _sinceMs: number) => s.pausedMs;

const enter = (s: RunState, i: number, now: number): RunState => {
  if (i >= s.slots.length) return { ...s, i, phase: 'done', endsAt: undefined, endedAt: now };
  const slot = s.slots[i];
  const blockStart = { ...s.blockStart };
  if (slot.blockId && blockStart[slot.blockId] === undefined) blockStart[slot.blockId] = now;
  let seconds = slot.seconds;
  if (slot.untilBoundary && slot.blockId && slot.everySec) {
    const into = (now - blockStart[slot.blockId] - s.pausedMs) / 1000;
    const boundary = (Math.floor(into / slot.everySec) + 1) * slot.everySec;
    seconds = Math.max(0, boundary - into);
  }
  // a capped block that has run out: skip its remaining slots
  if (slot.capSec && slot.blockId && blockStart[slot.blockId] !== undefined) {
    const into = (now - blockStart[slot.blockId] - s.pausedMs) / 1000;
    if (into >= slot.capSec) {
      let j = i;
      while (j < s.slots.length && s.slots[j].blockId === slot.blockId) j++;
      return enter({ ...s, blockStart }, j, now);
    }
  }
  return { ...s, i, phase: 'running', slotStartedAt: now, endsAt: seconds !== undefined ? now + seconds * 1000 : undefined, remainingMs: undefined, blockStart };
};

/** Advance past the current slot (Done / countdown finished / skip). */
export const advance = (s: RunState, now: number, opts: { skipped?: boolean } = {}): RunState => {
  if (s.phase === 'done') return s;
  if (s.phase === 'lead') return enter(s, 0, now);
  const c = current(s);
  const actuals = { ...s.actuals };
  const blockDone = { ...s.blockDone };
  if (c && !opts.skipped) {
    actuals[c.id] = { ...(actuals[c.id] ?? { changes: [] }), doneAt: now };
    if (c.blockId && c.kind === 'work') blockDone[c.blockId] = (blockDone[c.blockId] ?? 0) + 1;
  }
  return enter({ ...s, actuals, blockDone }, s.i + 1, now);
};

/** Countdown expiry check; call from the tick. */
export const tick = (s: RunState, now: number): RunState => {
  if (s.phase === 'lead' && s.endsAt !== undefined && now >= s.endsAt) return enter(s, 0, now);
  if (s.phase === 'running' && s.endsAt !== undefined && now >= s.endsAt) return advance(s, now);
  // amrap / fortime cap reached mid-slot
  const c = current(s);
  if (s.phase === 'running' && c?.capSec && c.blockId && s.blockStart[c.blockId] !== undefined && (now - s.blockStart[c.blockId] - s.pausedMs) / 1000 >= c.capSec) {
    let j = s.i;
    while (j < s.slots.length && s.slots[j].blockId === c.blockId) j++;
    return enter(s, j, now);
  }
  return s;
};

export const pause = (s: RunState, now: number): RunState => (s.phase === 'running' || s.phase === 'lead' ? { ...s, phase: 'paused', pausedAt: now, remainingMs: s.endsAt !== undefined ? Math.max(0, s.endsAt - now) : undefined } : s);
export const resume = (s: RunState, now: number): RunState => {
  if (s.phase !== 'paused' || s.pausedAt === undefined) return s;
  const gap = now - s.pausedAt;
  const wasLead = s.i === 0 && s.blockStart && Object.keys(s.blockStart).length === 0 && s.remainingMs !== undefined && s.slotStartedAt === s.startedAt;
  return { ...s, phase: wasLead ? 'lead' : 'running', pausedAt: undefined, pausedMs: s.pausedMs + gap, slotStartedAt: s.slotStartedAt + gap, endsAt: s.remainingMs !== undefined ? now + s.remainingMs : undefined, remainingMs: undefined };
};

/** Go back one slot (restarts its countdown). */
export const back = (s: RunState, now: number): RunState => (s.i > 0 ? enter(s, s.i - 1, now) : s);

/** Change the load/speed of the current work step; logged with the time into the slot. */
export const adjust = (s: RunState, now: number, target: number): RunState => {
  const c = current(s);
  if (!c || c.kind !== 'work') return s;
  const a = s.actuals[c.id] ?? { changes: [] };
  const atSec = Math.round((now - s.slotStartedAt) / 1000);
  return { ...s, actuals: { ...s.actuals, [c.id]: { ...a, target, changes: [...a.changes, { atSec, target }] } } };
};
export const setReps = (s: RunState, reps: number): RunState => {
  const c = current(s);
  if (!c || c.kind !== 'work') return s;
  return { ...s, actuals: { ...s.actuals, [c.id]: { ...(s.actuals[c.id] ?? { changes: [] }), reps } } };
};

/** Drop a step for the rest of the session: remove every remaining slot of it. */
export const drop = (s: RunState, now: number, stepId: string): RunState => {
  const c = current(s);
  const slots = s.slots.filter((sl, idx) => idx < s.i || sl.step.id !== stepId);
  const st = { ...s, slots, dropped: [...s.dropped, stepId] };
  return c?.step.id === stepId ? enter(st, s.i, now) : st;
};

export const finish = (s: RunState, now: number): RunState => ({ ...s, phase: 'done', endedAt: now, endsAt: undefined });

/** Everything a slot's step resolved to: the last adjusted target or the plan. */
export const targetOf = (s: RunState, slot: Slot): number | undefined => s.actuals[slot.id]?.target ?? (slot.step.kind === 'exercise' ? slot.step.target : undefined);

/** Build the result to log. Score follows the runsheet's score type: time = session elapsed, rounds = AMRAP rounds + reps. */
export const toResult = (s: RunState, r: Runsheet, now: number): SessionResult => {
  const type = scoreType(r);
  const durationSec = Math.round(elapsed(s, now));
  const steps = new Map<string, StepResult>();
  for (const slot of s.slots) {
    if (slot.kind !== 'work' || slot.step.kind !== 'exercise') continue;
    const a = s.actuals[slot.id];
    if (!a?.doneAt) continue;
    const key = slot.step.id;
    const prev = steps.get(key);
    const target = a.target ?? slot.step.target;
    steps.set(key, { stepId: key, exerciseKey: slot.step.exercise.key, target, reps: [...(prev?.reps ?? []), ...(a.reps !== undefined ? [a.reps] : slot.step.forMode === 'reps' ? [slot.step.forValue] : [])], success: prev?.success ?? true });
  }
  let score: number | undefined;
  if (type === 'time') score = durationSec;
  else if (type === 'rounds') {
    const amrap = r.items.find((i): i is Block => i.kind === 'block' && i.mode === 'amrap');
    if (amrap) {
      const done = s.blockDone[amrap.id] ?? 0;
      const per = amrap.steps.filter(x => x.kind === 'exercise').length || 1;
      const rounds = Math.floor(done / per);
      const extraSlots = done - rounds * per;
      const extraReps = amrap.steps.filter(x => x.kind === 'exercise').slice(0, extraSlots).reduce((t, x) => t + (x.kind === 'exercise' && x.forMode === 'reps' ? x.forValue : 0), 0);
      score = rounds + Math.min(999, extraReps) / 1000;
    }
  } else if (type === 'reps') score = [...steps.values()].reduce((t, x) => t + (x.reps?.reduce((a, b) => a + b, 0) ?? 0), 0);
  return { runsheetId: s.runsheetId, startedAt: new Date(s.startedAt).toISOString(), endedAt: new Date(s.endedAt ?? now).toISOString(), score, steps: [...steps.values()], notes: undefined, durationSec, completed: s.phase === 'done' && s.i >= s.slots.length, title: r.title };
};

// ── persistence ──
const KEY = 'tiger:run';
export const persist = (s: RunState) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, savedAt: Date.now() }));
  } catch {
    /* ignore */
  }
};
export const clearPersisted = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};
export const loadPersisted = (): RunState | null => {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    return r && Date.now() - r.savedAt < 6 * 3600 * 1000 && r.phase !== 'done' ? r : null;
  } catch {
    return null;
  }
};
