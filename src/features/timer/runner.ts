/**
 * The timer engine: expands a runsheet into slots (work, rest) and steps through them. Pure: every
 * transition takes `now` in ms so it can be tested without a clock. The React hook adds the
 * interval, sounds, wake lock and persistence.
 */
import { measureOf, plannedSet, rungSteps, scoreType, type Block, type ExerciseRef, type ExerciseStep, type ItemRole, type Runsheet, type SetPlan, type SetType, type Step } from '@/features/runsheet/model';
import type { RoundSplit, SessionResult, SetResult, StepResult } from '@/features/runsheet/progression';

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
  /** rounds blocks: what the step prescribes for this set on its own (step.sets[round]). Its reps
   * are already in step.forValue; its load is read by effectiveTarget. */
  plan?: SetPlan;
  /** Which top-level item (block or loose step) this slot belongs to, 0-based, and how many there are. */
  part: number;
  parts: number;
  /** The item's role: a warm-up or cool-down is not part of a for-time score. */
  role?: ItemRole;
}

export type Phase = 'ready' | 'lead' | 'running' | 'paused' | 'done';

export interface Actual {
  target?: number;
  incline?: number;
  reps?: number;
  changes: { atSec: number; target: number }[];
  /** The set's type changed on the grid; over the plan's. */
  type?: SetType;
  doneAt?: number;
  /** Session time when it was done, seconds, pauses excluded. */
  at?: number;
  /** Seconds worked on the set, kept when it is done: see `workedSeconds`. */
  seconds?: number;
  /** Distance or calories done, changed from the plan on the timer card or the set grid. */
  meters?: number;
  calories?: number;
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
  /** ms at which each block's first slot started, for caps and EMOM boundaries. A pause taken
   * inside a block moves its start later by the pause, so the block's clock excludes it. */
  blockStart: Record<string, number>;
  /** Slots completed per block (for AMRAP scoring). */
  blockDone: Record<string, number>;
  leadSec: number;
  /** What a pause interrupted, so resuming goes back to it: the lead-in or a running slot. */
  pausedFrom?: 'lead' | 'running';
  /** Session time, seconds, pauses excluded, at which each part (block or loose step) started and
   * was left. A for-time score is the time spent in the main parts: no lead-in, no gate, no warm-up. */
  partAt?: Record<number, number>;
  partOut?: Record<number, number>;
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
  const parts = r.items.filter(i => i.kind !== 'ref').length;
  let part = -1;
  let role: ItemRole | undefined;
  const push = (step: Step, extra: Partial<Slot> & Pick<Slot, 'mode' | 'round' | 'rounds'>) => {
    if (skip.has(step.id)) return;
    out.push({ id: `${step.id}#${n++}`, kind: step.kind === 'rest' ? 'rest' : 'work', step, seconds: slotSeconds(step), part, parts, ...(role ? { role } : {}), ...extra });
  };
  for (const it of r.items) {
    if (it.kind === 'ref') continue;
    part++;
    role = it.role;
    if (it.kind !== 'block') {
      push(it, { mode: 'loose', round: 0, rounds: 1 });
      continue;
    }
    const b = it as Block;
    const mode = b.mode ?? 'rounds';
    const base = { blockId: b.id, blockName: b.name, mode } as const;
    const between = (round: number, rounds: number) => {
      if (b.restBetweenSec && round < rounds - 1) out.push({ id: `${b.id}:between#${n++}`, kind: 'rest', step: { kind: 'rest', id: `${b.id}:between`, seconds: b.restBetweenSec }, seconds: b.restBetweenSec, part, parts, ...(role ? { role } : {}), ...base, round, rounds });
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
        out.push({ id: `${b.id}:wait#${n++}`, kind: 'rest', step: { kind: 'rest', id: `${b.id}:wait`, seconds: every }, seconds: every, untilBoundary: true, everySec: every, part, parts, ...(role ? { role } : {}), ...base, round: m, rounds: b.repeat });
      }
      continue;
    }
    const roundLen = b.steps.reduce((t, s) => t + estimate(s), 0);
    // An amrap's rounds are a guess to start from: a capped one grows a round at a time (see
    // extendAmrap) and ends on the cap, however fast the rounds go.
    const rounds = mode === 'amrap' ? Math.max(2, Math.ceil((b.timeCapSec ?? 600) / Math.max(15, roundLen))) : Math.max(1, b.repeat);
    for (let ri = 0; ri < rounds; ri++) {
      for (const s of b.steps) {
        const extra = { ...base, round: ri, rounds, capSec: mode === 'amrap' || mode === 'fortime' ? b.timeCapSec : undefined };
        if (mode !== 'rounds' || s.kind !== 'exercise' || !s.sets?.length) {
          push(s, extra);
          continue;
        }
        // A set with its own reps runs them; its load goes on the slot for effectiveTarget.
        const own = s.sets[ri];
        const plan = own && (own.reps !== undefined || own.load !== undefined || own.type !== undefined) ? own : undefined;
        push({ ...s, forValue: plannedSet(s, ri).reps }, { ...extra, ...(plan ? { plan } : {}) });
      }
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
  if (s.phase === 'ready') return { left: current(s)?.seconds, spent: 0 };
  if (s.phase === 'paused') return { left: s.remainingMs !== undefined ? s.remainingMs / 1000 : undefined, spent: ((s.pausedAt ?? now) - s.slotStartedAt) / 1000 };
  const spent = (now - s.slotStartedAt) / 1000;
  return { left: s.endsAt !== undefined ? Math.max(0, (s.endsAt - now) / 1000) : undefined, spent };
};
/** Seconds the current block has been running (for caps, fortime and amrap clocks). */
export const blockElapsed = (s: RunState, now: number) => {
  const c = current(s);
  if (!c?.blockId || s.blockStart[c.blockId] === undefined) return 0;
  const end = s.phase === 'paused' && s.pausedAt ? s.pausedAt : now;
  return Math.max(0, (end - s.blockStart[c.blockId]) / 1000);
};

/** Seconds left on the current block's cap (amrap, capped fortime); undefined for an uncapped block. */
export const capLeft = (s: RunState, now: number): number | undefined => {
  const c = current(s);
  if (!c?.capSec || s.phase === 'ready' || s.phase === 'lead') return undefined;
  return Math.max(0, c.capSec - blockElapsed(s, now));
};

/** EMOM work: seconds left in the minute (or whatever the interval is) the set belongs to. */
export const minuteLeft = (s: RunState, now: number): number | undefined => {
  const c = current(s);
  if (c?.mode !== 'emom' || c.kind !== 'work' || !c.everySec || (s.phase !== 'running' && s.phase !== 'paused')) return undefined;
  return Math.max(0, (c.round + 1) * c.everySec - blockElapsed(s, now));
};

/** Move to slot i. Entering a new part (block or loose step) going forward parks the timer in
 * `ready` until the user taps Start block, so equipment changes don't eat the countdown. */
const enter = (st: RunState, i: number, now: number): RunState => {
  // Moving on from a paused timer takes the pause out first, so it never counts as work.
  let s = st.phase === 'paused' ? resume(st, now) : st;
  const cur = s.phase === 'running' ? current(s) : undefined;
  if (cur && s.slots[i]?.part !== cur.part) s = { ...s, partOut: { ...s.partOut, [cur.part]: elapsed(s, now) } };
  if (i >= s.slots.length) return { ...s, i, phase: 'done', endsAt: undefined, endedAt: now };
  if (i > s.i) {
    const drop = restBeforeDrop(s, i);
    if (drop !== undefined) return enter(s, drop, now);
  }
  const slot = s.slots[i];
  if (i > 0 && i > s.i && slot.part !== s.slots[i - 1].part) return { ...s, i, phase: 'ready', slotStartedAt: now, endsAt: undefined, remainingMs: undefined };
  return activate(s, i, now);
};
/** The type of the set at slot idx: changed on the grid, else the plan's, else normal. */
export const typeAt = (s: RunState, idx: number): SetType => {
  const sl = s.slots[idx];
  return (sl && (s.actuals[sl.id]?.type ?? sl.plan?.type)) ?? 'normal';
};
/** A drop set follows the set before it with no rest (Hevy's rule): when slot i is a rest in a block
 * and the next set of that block is a drop set, the index of that set; else undefined. */
const restBeforeDrop = (s: RunState, i: number): number | undefined => {
  const sl = s.slots[i];
  if (sl?.kind !== 'rest' || sl.untilBoundary || !sl.blockId || sl.mode !== 'rounds') return undefined;
  let j = i;
  while (j < s.slots.length && s.slots[j].kind === 'rest' && s.slots[j].blockId === sl.blockId) j++;
  return j < s.slots.length && s.slots[j].blockId === sl.blockId && s.slots[j].kind === 'work' && typeAt(s, j) === 'drop' ? j : undefined;
};
/** Mark a set warm-up, normal, drop or to failure, from its row. Any set, done or not: the type is a label, not a number to lock. */
export const setTypeAt = (s: RunState, slotId: string, type: SetType): RunState => {
  const sl = s.slots[slotIndex(s, slotId)];
  if (!sl || sl.kind !== 'work') return s;
  return { ...s, actuals: { ...s.actuals, [slotId]: { ...(s.actuals[slotId] ?? { changes: [] }), type } } };
};

/** Start the block the timer is parked on. */
export const startBlock = (s: RunState, now: number): RunState => (s.phase === 'ready' ? activate(s, s.i, now) : s);
const activate = (st: RunState, i: number, now: number): RunState => {
  const s = st.partAt?.[st.slots[i].part] === undefined ? { ...st, partAt: { ...st.partAt, [st.slots[i].part]: elapsed(st, now) } } : st;
  const slot = s.slots[i];
  const blockStart = { ...s.blockStart };
  if (slot.blockId && blockStart[slot.blockId] === undefined) blockStart[slot.blockId] = now;
  let seconds = slot.seconds;
  if (slot.untilBoundary && slot.blockId && slot.everySec) {
    // The wait ends on its own minute's boundary. A minute that overran has none left: the next
    // minute starts at once and catches up, rather than the block quietly growing a minute.
    const into = (now - blockStart[slot.blockId]) / 1000;
    seconds = (slot.round + 1) * slot.everySec - into;
    if (seconds <= 0) return enter({ ...s, blockStart, i }, i + 1, now);
  }
  // a capped block that has run out: skip its remaining slots
  if (slot.capSec && slot.blockId && blockStart[slot.blockId] !== undefined) {
    const into = (now - blockStart[slot.blockId]) / 1000;
    if (into >= slot.capSec) {
      let j = i;
      while (j < s.slots.length && s.slots[j].blockId === slot.blockId) j++;
      return enter({ ...s, blockStart }, j, now);
    }
  }
  return { ...s, i, phase: 'running', slotStartedAt: now, endsAt: seconds !== undefined ? now + seconds * 1000 : undefined, remainingMs: undefined, blockStart };
};

/** Advance past the current slot (Done / countdown finished / skip). */
export const advance = (given: RunState, now: number, opts: { skipped?: boolean } = {}): RunState => {
  if (given.phase === 'done') return given;
  // Done on a paused timer: the pause comes out first, and a paused lead-in is still a lead-in.
  const s = given.phase === 'paused' ? resume(given, now) : given;
  if (s.phase === 'lead') return enter(s, 0, now);
  if (s.phase === 'ready') return activate(s, s.i + 1 < s.slots.length && s.slots[s.i + 1].part === s.slots[s.i].part ? s.i + 1 : s.i, now);
  const c = current(s);
  const actuals = { ...s.actuals };
  const blockDone = { ...s.blockDone };
  if (c && !opts.skipped) {
    const worked = workedSeconds(s, c, now);
    actuals[c.id] = { ...(actuals[c.id] ?? { changes: [] }), doneAt: now, at: Math.round(elapsed(s, now)), ...(worked !== undefined ? { seconds: worked } : {}) };
    if (c.blockId && c.kind === 'work') blockDone[c.blockId] = (blockDone[c.blockId] ?? 0) + 1;
  }
  const st = { ...s, actuals, blockDone };
  return enter(c ? extendAmrap(st, c) : st, s.i + 1, now);
};

/** The work a set's time says something about: a countdown (a plank, a 40 s interval), a max
 * effort, a distance or a calorie count. A set of reps is left out — its time is mostly the rest
 * before the tick — and so is a follow-along video segment. */
export const timesWork = (sl: Slot) => sl.kind === 'work' && sl.step.kind === 'exercise' && sl.step.forMode !== 'segment' && (sl.seconds !== undefined || sl.step.forMode === 'max' || sl.step.forMode === 'meters' || sl.step.forMode === 'calories');

/** Seconds spent on the running slot, pauses out: for a countdown, as long as it ran — the whole
 * interval when it ran out, less when it was ended early. Undefined for work whose time says
 * nothing, and for a set done the moment it began (ticked straight after its rest). */
const workedSeconds = (s: RunState, c: Slot, now: number): number | undefined => {
  if (!timesWork(c) || s.phase !== 'running') return undefined;
  const spent = Math.max(0, (now - s.slotStartedAt) / 1000);
  const sec = Math.round(c.seconds !== undefined ? Math.min(c.seconds, spent) : spent);
  return sec > 0 ? sec : undefined;
};

/** Leaving the last expanded round of a capped amrap before its cap: add one more round (and the
 * rest before it), copied from the round just run so drops and swaps carry. */
const extendAmrap = (s: RunState, c: Slot): RunState => {
  if (c.mode !== 'amrap' || !c.capSec || !c.blockId || s.slots[s.i + 1]?.blockId === c.blockId) return s;
  const round = c.round + 1;
  const rounds = Math.max(c.rounds, round + 1);
  const serial = (id: string) => Number(id.slice(id.lastIndexOf('#') + 1));
  let n = s.slots.reduce((m, sl) => Math.max(m, serial(sl.id)), -1) + 1;
  const copy = (sl: Slot): Slot => ({ ...sl, id: `${sl.id.slice(0, sl.id.lastIndexOf('#'))}#${n++}`, round, rounds });
  const between = s.slots.find(sl => sl.blockId === c.blockId && sl.step.id === `${c.blockId}:between`);
  const last = s.slots.filter(sl => sl.blockId === c.blockId && sl.round === c.round && sl.step.id !== `${c.blockId}:between`);
  const added = [...(between ? [{ ...copy(between), round: c.round }] : []), ...last.map(copy)];
  return { ...s, slots: [...s.slots.slice(0, s.i + 1), ...added, ...s.slots.slice(s.i + 1)] };
};

/** Countdown expiry check; call from the tick. */
export const tick = (s: RunState, now: number): RunState => {
  if (s.phase === 'lead' && s.endsAt !== undefined && now >= s.endsAt) return enter(s, 0, now);
  if (s.phase === 'running' && s.endsAt !== undefined && now >= s.endsAt) return advance(s, now);
  // amrap / fortime cap reached mid-slot
  const c = current(s);
  if (s.phase === 'running' && c?.capSec && c.blockId && s.blockStart[c.blockId] !== undefined && (now - s.blockStart[c.blockId]) / 1000 >= c.capSec) {
    let j = s.i;
    while (j < s.slots.length && s.slots[j].blockId === c.blockId) j++;
    return enter(s, j, now);
  }
  return s;
};

export const pause = (s: RunState, now: number): RunState => (s.phase === 'running' || s.phase === 'lead' ? { ...s, phase: 'paused', pausedFrom: s.phase, pausedAt: now, remainingMs: s.endsAt !== undefined ? Math.max(0, s.endsAt - now) : undefined } : s);
export const resume = (s: RunState, now: number): RunState => {
  if (s.phase !== 'paused' || s.pausedAt === undefined) return s;
  const gap = now - s.pausedAt;
  // A run paused before pausedFrom was kept: the lead-in is the only pause before any block starts.
  const wasLead = s.pausedFrom ? s.pausedFrom === 'lead' : s.i === 0 && Object.keys(s.blockStart ?? {}).length === 0 && s.remainingMs !== undefined && s.slotStartedAt === s.startedAt;
  const block = current(s)?.blockId;
  const blockStart = block !== undefined && s.blockStart[block] !== undefined ? { ...s.blockStart, [block]: s.blockStart[block] + gap } : s.blockStart;
  return { ...s, blockStart, phase: wasLead ? 'lead' : 'running', pausedAt: undefined, pausedFrom: undefined, pausedMs: s.pausedMs + gap, slotStartedAt: s.slotStartedAt + gap, endsAt: s.remainingMs !== undefined ? now + s.remainingMs : undefined, remainingMs: undefined };
};

/** Go back one slot (restarts its countdown). The step gone back to is no longer done until it is
 * done again, so an AMRAP round is not counted twice. */
export const back = (s: RunState, now: number): RunState => {
  if (s.i <= 0 || s.phase === 'lead' || s.phase === 'done') return s;
  const prev = s.slots[s.i - 1];
  // A capped block whose cap has passed is over: its set is not reopened, since the block would be
  // skipped at once and the next one started without its gate.
  const began = prev.blockId !== undefined ? s.blockStart[prev.blockId] : undefined;
  if (prev.capSec && began !== undefined && prev.blockId !== current(s)?.blockId && (now - began) / 1000 >= prev.capSec) return s;
  const out = enter(prev.kind === 'work' ? reopenSet(s, prev.id) : s, s.i - 1, now);
  const from = s.slots[s.i]?.part;
  if (from === undefined || prev.part >= from) return out;
  // Back into the part before: it is open again and the part left has not begun, so a for-time
  // score counts the time since once, in the part gone back to.
  const partAt = { ...out.partAt };
  const partOut = { ...out.partOut };
  const blockStart = { ...out.blockStart };
  for (const k of Object.keys(partOut)) if (Number(k) >= prev.part) delete partOut[Number(k)];
  for (const k of Object.keys(partAt)) if (Number(k) > prev.part) delete partAt[Number(k)];
  for (const sl of out.slots) if (sl.part > prev.part && sl.blockId !== undefined) delete blockStart[sl.blockId];
  return { ...out, partAt, partOut, blockStart };
};

/**
 * Lengthen (or, with a negative `by`, shorten) the rest that is counting down, running or paused:
 * the timer's −15 s / +15 s and the Lock Screen's +15 s. The slot's length moves with it, so the
 * ring and the overall progress stay true. A rest shortened past now ends on the next tick. A work
 * slot, a user-paced step and an EMOM's wait (the minute's clock, not a rest) are left alone.
 */
export const extendRest = (s: RunState, now: number, by: number): RunState => {
  const c = current(s);
  if (!c || c.kind !== 'rest' || c.untilBoundary || c.seconds === undefined) return s;
  const left = s.phase === 'running' && s.endsAt !== undefined ? s.endsAt - now : s.phase === 'paused' && s.remainingMs !== undefined ? s.remainingMs : undefined;
  if (left === undefined) return s;
  const nextLeft = Math.max(0, left + by * 1000);
  const moved = (nextLeft - left) / 1000;
  const slots = s.slots.map((sl, i) => (i === s.i ? { ...sl, seconds: Math.max(0, (sl.seconds ?? 0) + moved) } : sl));
  return s.phase === 'running' ? { ...s, slots, endsAt: now + nextLeft } : { ...s, slots, remainingMs: nextLeft };
};

/** Change the load/speed of the current work step; logged with the time into the slot. */
export const adjust = (s: RunState, now: number, target: number): RunState => {
  const c = current(s);
  if (!c || c.kind !== 'work') return s;
  const a = s.actuals[c.id] ?? { changes: [] };
  const atSec = Math.round((now - s.slotStartedAt) / 1000);
  return { ...s, actuals: { ...s.actuals, [c.id]: { ...a, target, changes: [...a.changes, { atSec, target }] } } };
};
/** Change the incline of the current treadmill step; carried forward like a load change. */
export const adjustIncline = (s: RunState, incline: number): RunState => {
  const c = current(s);
  if (!c || c.kind !== 'work') return s;
  return { ...s, actuals: { ...s.actuals, [c.id]: { ...(s.actuals[c.id] ?? { changes: [] }), incline } } };
};
/**
 * Change a step that has not come round yet, from the overview. The load lands on the step's
 * first slot from here on, and effectiveTarget's backward scan carries it to every later round —
 * so setting the bench from the overview at block one holds when block three arrives.
 */
const firstUpcoming = (s: RunState, stepId: string) => s.slots.findIndex((sl, i) => i >= s.i && sl.step.id === stepId && sl.kind === 'work');
export const adjustStep = (s: RunState, stepId: string, target: number): RunState => {
  const idx = firstUpcoming(s, stepId);
  if (idx < 0) return s;
  const id = s.slots[idx].id;
  const a = s.actuals[id] ?? { changes: [] };
  return { ...s, actuals: { ...s.actuals, [id]: { ...a, target, changes: [...a.changes, { atSec: 0, target }] } } };
};
export const adjustStepIncline = (s: RunState, stepId: string, incline: number): RunState => {
  const idx = firstUpcoming(s, stepId);
  if (idx < 0) return s;
  const id = s.slots[idx].id;
  return { ...s, actuals: { ...s.actuals, [id]: { ...(s.actuals[id] ?? { changes: [] }), incline } } };
};

export const setReps = (s: RunState, reps: number): RunState => {
  const c = current(s);
  if (!c || c.kind !== 'work') return s;
  return { ...s, actuals: { ...s.actuals, [c.id]: { ...(s.actuals[c.id] ?? { changes: [] }), reps } } };
};

/** The metres or calories done on the running distance or calorie step, when not what the plan said. */
export const setAmount = (s: RunState, value: number): RunState => {
  const c = current(s);
  return c ? setAmountAt(s, c.id, value) : s;
};
/** Which field a step's amount goes in: metres or calories for a step done for either, or for a
 * rower, ski erg or bike on the clock (the machine counts what you did); none for other work. */
export const amountField = (sl: Slot | undefined): 'meters' | 'calories' | undefined => {
  if (sl?.kind !== 'work' || sl.step.kind !== 'exercise') return undefined;
  const { forMode, exercise } = sl.step;
  if (forMode === 'meters' || forMode === 'calories') return forMode;
  const m = measureOf(exercise.unit);
  return m === 'meters' || m === 'calories' ? m : undefined;
};
/** What a distance or calorie set did: changed on the card or the grid, else the plan's distance or
 * calories. A timed piece on a machine has no plan for it, so only what was entered. */
export const amountAt = (s: RunState, sl: Slot): number | undefined => {
  const f = amountField(sl);
  if (!f || sl.step.kind !== 'exercise') return undefined;
  return s.actuals[sl.id]?.[f] ?? (sl.step.forMode === f ? sl.step.forValue : undefined);
};

// ── the set grid ──
const slotIndex = (s: RunState, slotId: string) => s.slots.findIndex(sl => sl.id === slotId);
/** Change the load of one set from its row: the running set as `adjust` does, a set still to come
 * as if set ahead, a done set only after it has been un-ticked. */
export const adjustAt = (s: RunState, now: number, slotId: string, target: number): RunState => {
  const idx = slotIndex(s, slotId);
  const sl = s.slots[idx];
  if (!sl || sl.kind !== 'work' || s.actuals[slotId]?.doneAt !== undefined) return s;
  if (idx === s.i) return adjust(s, now, target);
  const a = s.actuals[slotId] ?? { changes: [] };
  return { ...s, actuals: { ...s.actuals, [slotId]: { ...a, target, changes: [...a.changes, { atSec: 0, target }] } } };
};
/** Reps for one set from its row. A done set is locked like its load. */
export const setRepsAt = (s: RunState, slotId: string, reps: number): RunState => {
  const sl = s.slots[slotIndex(s, slotId)];
  if (!sl || sl.kind !== 'work' || s.actuals[slotId]?.doneAt !== undefined) return s;
  return { ...s, actuals: { ...s.actuals, [slotId]: { ...(s.actuals[slotId] ?? { changes: [] }), reps } } };
};
/** Metres or calories for one set from its row. A done set is locked like its reps. */
export const setAmountAt = (s: RunState, slotId: string, value: number): RunState => {
  const sl = s.slots[slotIndex(s, slotId)];
  const f = amountField(sl);
  if (!f || s.actuals[slotId]?.doneAt !== undefined) return s;
  return { ...s, actuals: { ...s.actuals, [slotId]: { ...(s.actuals[slotId] ?? { changes: [] }), [f]: value } } };
};
/** Only rest stands between the cursor and slot idx, inside one block: the set after the rest. */
const onlyRestBefore = (s: RunState, idx: number) => idx > s.i && s.slots.slice(s.i, idx).every(sl => sl.kind === 'rest' && sl.blockId === s.slots[idx].blockId);
/** The tick on a set row. The running set is Done (advance). The set after a rest ends the rest
 * early and is done in the same tap — people start before the rest runs out. A set passed without
 * a tick (skipped, or un-ticked to fix its weight) is logged where it is and the cursor stays put. */
export const completeSet = (s: RunState, now: number, slotId: string): RunState => {
  const idx = slotIndex(s, slotId);
  const sl = s.slots[idx];
  if (!sl || sl.kind !== 'work' || s.actuals[slotId]?.doneAt !== undefined) return s;
  if (s.phase !== 'running' && s.phase !== 'paused' && idx >= s.i) return s;
  if (idx === s.i) return advance(s, now);
  if (onlyRestBefore(s, idx)) {
    let st = s;
    while (st.i < idx) st = advance(st, now, { skipped: true });
    return st.i === idx ? advance(st, now) : st;
  }
  if (idx > s.i) return s;
  const blockDone = sl.blockId ? { ...s.blockDone, [sl.blockId]: (s.blockDone[sl.blockId] ?? 0) + 1 } : s.blockDone;
  return { ...s, blockDone, actuals: { ...s.actuals, [slotId]: { ...(s.actuals[slotId] ?? { changes: [] }), doneAt: now, at: Math.round(elapsed(s, now)) } } };
};
/** Un-tick a done set so its weight and reps can be put right. It is not logged until ticked again. */
export const reopenSet = (s: RunState, slotId: string): RunState => {
  const sl = s.slots[slotIndex(s, slotId)];
  const a = s.actuals[slotId];
  if (!sl || a?.doneAt === undefined) return s;
  const rest = { ...a };
  delete rest.doneAt;
  delete rest.at;
  delete rest.seconds;
  const blockDone = sl.blockId ? { ...s.blockDone, [sl.blockId]: Math.max(0, (s.blockDone[sl.blockId] ?? 0) - 1) } : s.blockDone;
  return { ...s, blockDone, actuals: { ...s.actuals, [slotId]: rest } };
};

/** Last time's numbers into a set that is not done yet: its load and its reps, either or both. */
export const fillSet = (s: RunState, now: number, slotId: string, set: SetResult): RunState => {
  let st = s;
  if (set.load !== undefined) st = adjustAt(st, now, slotId, set.load);
  if (set.reps !== undefined) st = setRepsAt(st, slotId, set.reps);
  const amount = set.meters ?? set.calories;
  if (amount !== undefined) st = setAmountAt(st, slotId, amount);
  return st;
};

/** A set whose reps the plan leaves open — a range (8–12), a max, or reps-plus — in a block that is
 * one exercise done for sets. */
const openReps = (s: RunState, sl: Slot) =>
  sl.kind === 'work' &&
  sl.step.kind === 'exercise' &&
  sl.plan?.reps === undefined &&
  (sl.step.forMax !== undefined || sl.step.forMode === 'max' || sl.step.forMode === 'amrap') &&
  !!sl.blockId &&
  s.slots.every(x => x.blockId !== sl.blockId || x.kind !== 'work' || x.step.id === sl.step.id);
/**
 * Fill the reps of every open set still to come from last time's matching set (`last` gets the
 * step and the set's round), so the grid starts on what was done rather than on the bottom of the
 * range. A set with reps already set is left alone.
 */
export const prefillReps = (s: RunState, last: (step: ExerciseStep, round: number) => number | undefined): RunState => {
  const actuals = { ...s.actuals };
  let changed = false;
  for (const sl of s.slots) {
    if (!openReps(s, sl) || sl.step.kind !== 'exercise') continue;
    const a = actuals[sl.id];
    if (a?.doneAt !== undefined || a?.reps !== undefined) continue;
    const reps = last(sl.step, sl.round);
    if (reps === undefined) continue;
    actuals[sl.id] = { ...(a ?? { changes: [] }), reps };
    changed = true;
  }
  return changed ? { ...s, actuals } : s;
};

/** Drop a step for the rest of the session: remove every remaining slot of it. */
export const drop = (s: RunState, now: number, stepId: string): RunState => {
  const c = current(s);
  const slots = s.slots.filter((sl, idx) => idx < s.i || sl.step.id !== stepId);
  const st = { ...s, slots, dropped: [...s.dropped, stepId] };
  return c?.step.id === stepId ? enter(st, s.i, now) : st;
};

/** A swap drops the plan's loads (they were for the planned exercise) but keeps its reps and the set's type. */
const keptOnSwap = (plan: SetPlan | undefined): SetPlan | undefined =>
  plan && (plan.reps !== undefined || plan.type !== undefined) ? { ...(plan.reps !== undefined ? { reps: plan.reps } : {}), ...(plan.type ? { type: plan.type } : {}) } : undefined;

/**
 * Swap the exercise of a step for another, from the current slot to the end of the session.
 * The machine Nick planned for is taken, so the session carries on with what is free — rounds
 * already done keep the exercise they were done with.
 */
export const swap = (s: RunState, now: number, stepId: string, to: ExerciseRef, target?: number): RunState => {
  const c = current(s);
  const slots = s.slots.map((sl, idx) => {
    if (idx < s.i || sl.step.id !== stepId || sl.step.kind !== 'exercise') return sl;
    // The plan's loads were for the planned exercise; the swap's target stands in for them.
    return { ...sl, step: { ...sl.step, exercise: to, target }, plan: keptOnSwap(sl.plan) };
  });
  const st = { ...s, slots };
  return c?.step.id === stepId ? enter(st, s.i, now) : st;
};

/**
 * Re-plan the session around an edited runsheet (specs/unified-editing.md). What is done or running
 * stays exactly as it is, actuals included — the running block's later rounds too; every item after
 * it is rebuilt from the edited sheet in the sheet's order, so the next block's rounds, rest,
 * durations and order can change mid-session. Parked at a block gate, the parked block counts as
 * still to come. Drops, swaps and loads set ahead carry into the rebuilt slots; an item already
 * passed is never run again, wherever the edit moved it.
 */
export const replan = (s: RunState, r: Runsheet, now: number): RunState => {
  if (s.phase === 'done') return s;
  const cur = current(s);
  let keptCount = 0;
  if (s.phase === 'ready') keptCount = s.i;
  else if (s.phase !== 'lead' && cur) {
    const end = s.slots.findIndex(sl => sl.part > cur.part);
    keptCount = end < 0 ? s.slots.length : end;
  }
  const kept = s.slots.slice(0, keptCount);
  const old = s.slots.slice(keptCount);
  const itemOf = (sl: Slot) => sl.blockId ?? sl.step.id;
  const passed = new Set(kept.map(itemOf));
  // What the old tail knew that the sheet does not: swapped exercises and loads set ahead.
  const was = new Map<string, Step>();
  const ahead = new Map<string, Actual>();
  for (const sl of old) {
    if (sl.step.kind === 'exercise' && !was.has(sl.step.id)) was.set(sl.step.id, sl.step);
    const a = s.actuals[sl.id];
    if (a && !a.doneAt && !ahead.has(sl.step.id)) ahead.set(sl.step.id, a);
  }
  const serial = (id: string) => Number(id.slice(id.lastIndexOf('#') + 1));
  let n = kept.reduce((m, sl) => Math.max(m, serial(sl.id)), -1) + 1;
  const base = (kept[kept.length - 1]?.part ?? -1) + 1;
  const partOf = new Map<number, number>();
  const actuals = { ...s.actuals };
  for (const sl of old) delete actuals[sl.id];
  const tail: Slot[] = [];
  for (const sl of expand(r, s.dropped)) {
    if (passed.has(itemOf(sl))) continue;
    if (!partOf.has(sl.part)) partOf.set(sl.part, base + partOf.size);
    const id = `${sl.id.slice(0, sl.id.lastIndexOf('#'))}#${n++}`;
    let step = sl.step;
    const w = was.get(step.id);
    let plan = sl.plan;
    if (step.kind === 'exercise' && w?.kind === 'exercise' && w.exercise.key !== step.exercise.key) {
      step = { ...step, exercise: w.exercise, target: w.target };
      plan = keptOnSwap(plan);
    }
    const a = ahead.get(step.id);
    if (a && !tail.some(t => t.step.id === step.id)) actuals[id] = a;
    tail.push({ ...sl, id, step, plan, part: partOf.get(sl.part)! });
  }
  const parts = base + partOf.size;
  const st = { ...s, slots: [...kept, ...tail].map(sl => ({ ...sl, parts })), actuals };
  return s.phase === 'ready' && tail.length === 0 ? enter(st, s.i, now) : st;
};

/** One id per session, so logging it at the end and saving its result sheet is one row, not two. */
export const sessionId = (s: RunState) => `s-${Math.round(s.startedAt).toString(36)}-run`;

export const finish = (st: RunState, now: number): RunState => {
  // Finished while paused: the pause is not workout time.
  const s = st.phase === 'paused' ? resume(st, now) : st;
  const cur = s.phase === 'running' ? current(s) : undefined;
  const partOut = cur && s.partOut?.[cur.part] === undefined ? { ...s.partOut, [cur.part]: elapsed(s, now) } : s.partOut;
  return { ...s, phase: 'done', endedAt: now, endsAt: undefined, ...(partOut ? { partOut } : {}) };
};

/** The load in force at slot index idx: walking back through the rounds of the same step with the
 * same exercise, the first adjustment or prescribed set load met, else the step's target. So an
 * adjustment carries to later rounds until a round that prescribes its own load (a pyramid's next
 * step), and that round's load carries on in turn. A swap starts afresh from the swap's target. */
const sameWork = (a: Slot, b: Slot) => a.step.id === b.step.id && (a.step.kind !== 'exercise' || b.step.kind !== 'exercise' || a.step.exercise.key === b.step.exercise.key);
export const effectiveTarget = (s: RunState, idx: number): number | undefined => {
  const slot = s.slots[idx];
  if (!slot) return undefined;
  for (let j = idx; j >= 0; j--) {
    const sl = s.slots[j];
    if (!sameWork(sl, slot)) continue;
    const t = s.actuals[sl.id]?.target ?? sl.plan?.load;
    if (t !== undefined) return t;
  }
  return slot.step.kind === 'exercise' ? slot.step.target : undefined;
};
export const effectiveIncline = (s: RunState, idx: number): number | undefined => {
  const slot = s.slots[idx];
  if (!slot) return undefined;
  for (let j = idx; j >= 0; j--) {
    const sl = s.slots[j];
    if (!sameWork(sl, slot)) continue;
    const t = s.actuals[sl.id]?.incline;
    if (t !== undefined) return t;
  }
  return slot.step.kind === 'exercise' ? slot.step.incline : undefined;
};
/** Everything a slot's step resolved to: the last adjusted target (from this or an earlier round) or the plan. */
export const targetOf = (s: RunState, slot: Slot): number | undefined => effectiveTarget(s, s.slots.findIndex(x => x.id === slot.id));
/** What a step will be lifted at when it next comes round, for the overview. */
export const plannedTarget = (s: RunState, stepId: string): number | undefined => {
  const idx = s.slots.findIndex((sl, i) => i >= s.i && sl.step.id === stepId);
  return idx < 0 ? undefined : effectiveTarget(s, idx);
};
export const plannedIncline = (s: RunState, stepId: string): number | undefined => {
  const idx = s.slots.findIndex((sl, i) => i >= s.i && sl.step.id === stepId);
  return idx < 0 ? undefined : effectiveIncline(s, idx);
};
/** Estimated length of a slot in seconds, for overall progress. */
export const slotEstimate = (slot: Slot) => slot.seconds ?? estimate(slot.step);
/** Fraction of the whole session done, weighted by slot length, including progress through the current slot. */
export const overall = (s: RunState, now: number): number => {
  const total = s.slots.reduce((t, sl) => t + slotEstimate(sl), 0) || 1;
  if (s.phase === 'done') return 1;
  let done = 0;
  for (let j = 0; j < s.i; j++) done += slotEstimate(s.slots[j]);
  const c = current(s);
  if (c && (s.phase === 'running' || s.phase === 'paused')) {
    const cl = clock(s, now);
    const est = slotEstimate(c);
    done += cl.left !== undefined && c.seconds ? est * (1 - cl.left / c.seconds) : Math.min(est, cl.spent);
  }
  return Math.min(1, done / total);
};

/** Build the result to log. Score follows the runsheet's score type: time = session elapsed, rounds = AMRAP rounds + reps. */
export const toResult = (s: RunState, r: Runsheet, now: number): SessionResult => {
  const type = scoreType(r);
  const durationSec = Math.round(elapsed(s, now));
  const steps = new Map<string, StepResult>();
  // Success feeds the progression rules, so only a step under a rule has one: an unrelated workout
  // doing the same lift must not break its fail streak.
  const ruled = (slot: Slot) => (r.items.find((i): i is Block => i.kind === 'block' && i.id === slot.blockId)?.progression ?? r.progression) !== undefined;
  for (const [idx, slot] of s.slots.entries()) {
    if (slot.kind !== 'work' || slot.step.kind !== 'exercise') continue;
    const a = s.actuals[slot.id];
    if (!a?.doneAt) continue;
    // A step swapped mid-session logs one row per exercise, so the rounds done before the swap
    // keep the exercise and load they were done with.
    const key = `${slot.step.id}|${slot.step.exercise.key}`;
    const prev = steps.get(key);
    // An exercise counted in metres, seconds or calories has no load: its unit is the measure.
    const target = measureOf(slot.step.exercise.unit) ? undefined : effectiveTarget(s, idx);
    const incline = effectiveIncline(s, idx);
    const reps = a.reps !== undefined ? a.reps : slot.step.forMode === 'reps' ? slot.step.forValue : undefined;
    const at = doneAtSec(s, a);
    const type = typeAt(s, idx);
    const f = amountField(slot);
    const amount = amountAt(s, slot);
    const set: SetResult = { ...(reps !== undefined ? { reps } : {}), ...(target !== undefined ? { load: target } : {}), ...(at !== undefined ? { at } : {}), ...(type !== 'normal' ? { type } : {}), ...(a.seconds !== undefined ? { seconds: a.seconds } : {}), ...(f && amount !== undefined ? { [f]: amount } : {}) };
    // `target` and `reps` are for readers from before per-set rows: a warm-up is not the load
    // worked at and its reps are not work, so they stay out of both.
    const warm = type === 'warmup';
    // A working set short of its prescribed reps is a miss.
    const short = !warm && reps !== undefined && slot.step.forMode === 'reps' && reps < slot.step.forValue;
    const success = ruled(slot) ? (prev?.success ?? true) && !short : undefined;
    steps.set(key, { stepId: slot.step.id, exerciseKey: slot.step.exercise.key, target: warm ? (prev?.target ?? target) : target, ...(incline !== undefined ? { incline } : {}), reps: [...(prev?.reps ?? []), ...(reps !== undefined && !warm ? [reps] : [])], ...(success !== undefined ? { success } : {}), sets: [...(prev?.sets ?? []), set] });
  }
  // A set of the step left undone (skipped, never reached) is a missed session for the progression
  // rules, not a success. An AMRAP's rounds are a guess, so its undone ones say nothing.
  for (const [idx, slot] of s.slots.entries()) {
    if (slot.kind !== 'work' || slot.step.kind !== 'exercise' || slot.mode === 'amrap' || s.actuals[slot.id]?.doneAt || typeAt(s, idx) === 'warmup') continue;
    const row = steps.get(`${slot.step.id}|${slot.step.exercise.key}`);
    if (row && row.success !== undefined) row.success = false;
  }
  let score: number | undefined;
  if (type === 'time') score = timeScore(s, now) ?? durationSec;
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
  const split = splits(s);
  return { runsheetId: s.runsheetId, startedAt: new Date(s.startedAt).toISOString(), endedAt: new Date(s.endedAt ?? now).toISOString(), score, steps: [...steps.values()], ...(split.length ? { splits: split } : {}), notes: undefined, durationSec, completed: s.phase === 'done' && s.i >= s.slots.length, title: r.title };
};

/** Seconds spent in the main parts — blocks and loose steps that are not a warm-up or cool-down —
 * each from its start to when it was left: the lead-in and the time parked at a Start block gate
 * fall between parts, and pauses are out of the session clock already. Undefined when no main part
 * has started. */
const timeScore = (s: RunState, now: number): number | undefined => {
  const end = elapsed(s, now);
  let total: number | undefined;
  for (const [p, at] of Object.entries(s.partAt ?? {})) {
    const role = s.slots.find(sl => sl.part === Number(p))?.role ?? 'main';
    if (role !== 'main') continue;
    total = (total ?? 0) + Math.max(0, (s.partOut?.[Number(p)] ?? end) - at);
  }
  return total === undefined ? undefined : Math.round(total);
};

/** Session time a slot was done at. A run saved before `at` was kept falls back to its clock time
 * less every pause, which is right unless the pause came after it. */
const doneAtSec = (s: RunState, a: Actual | undefined): number | undefined => {
  if (a?.doneAt === undefined) return undefined;
  return a.at ?? Math.max(0, Math.round((a.doneAt - s.startedAt - s.pausedMs) / 1000));
};

/**
 * When each round of a circuit or AMRAP finished: the latest tick in the round. A block of one
 * exercise done for sets is left out — its set times are on the sets. A round counts once it is
 * closed (its last exercise done, or a later round begun); the first round that is not ends the
 * list, so an AMRAP's half round at the cap is not a split.
 */
export const splits = (s: RunState): RoundSplit[] => {
  const blocks = new Map<string, Map<number, Slot[]>>();
  for (const sl of s.slots) {
    if (sl.kind !== 'work' || !sl.blockId) continue;
    const rounds = blocks.get(sl.blockId) ?? new Map<number, Slot[]>();
    rounds.set(sl.round, [...(rounds.get(sl.round) ?? []), sl]);
    blocks.set(sl.blockId, rounds);
  }
  const out: RoundSplit[] = [];
  for (const [blockId, rounds] of blocks) {
    const all = [...rounds.values()].flat();
    const circuit = all.some(sl => sl.mode === 'amrap' || sl.mode === 'fortime') || [...rounds.values()].some(r => r.length > 1);
    if (!circuit) continue;
    const at: number[] = [];
    const order = [...rounds.keys()].sort((a, b) => a - b);
    for (const [k, r] of order.entries()) {
      const round = rounds.get(r)!;
      const times = round.map(sl => doneAtSec(s, s.actuals[sl.id])).filter((t): t is number => t !== undefined);
      const later = order.slice(k + 1).some(r => rounds.get(r)!.some(sl => s.actuals[sl.id]?.doneAt !== undefined));
      const closed = s.actuals[round[round.length - 1].id]?.doneAt !== undefined || later;
      if (!times.length || !closed) break;
      at.push(Math.max(...times));
    }
    const from = s.partAt?.[[...rounds.values()][0][0].part];
    if (at.length) out.push({ blockId, at, ...(from !== undefined ? { from: Math.round(from) } : {}) });
  }
  return out;
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
/** The run kept on this device, if it is under six hours old and not done — and, given a workout
 * id, only if it is that workout's. */
export const loadPersisted = (runsheetId?: string): { state: RunState; savedAt: number } | null => {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!r || !(Date.now() - r.savedAt < 6 * 3600 * 1000) || r.phase === 'done') return null;
    if (runsheetId !== undefined && r.runsheetId !== runsheetId) return null;
    const { savedAt, ...state } = r;
    return { state: state as RunState, savedAt };
  } catch {
    return null;
  }
};
/** A kept run, picked up again: paused at the moment it was last saved, so the time the tab was
 * closed never counts and nothing counts down before you are ready (as on iOS). */
export const restore = (s: RunState, savedAt: number): RunState => (s.phase === 'running' || s.phase === 'lead' ? pause(s, savedAt) : s);
