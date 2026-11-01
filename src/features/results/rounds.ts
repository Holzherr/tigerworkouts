/**
 * Round times from the splits the timer keeps: how long each round of a circuit, AMRAP or for-time
 * block took, the fastest and slowest, the same rounds last time, and the fastest round a workout
 * has ever had. Pure functions over `SessionResult[]`; ported one for one to
 * `ios/TigerWorkouts/Results/Rounds.swift`.
 */
import { stepLogs, type Block, type Runsheet, type StepLog } from '@/features/runsheet/model';
import type { RoundSplit, SessionResult } from '@/features/runsheet/progression';

/** A block whose rounds the timer fixed: rounds or EMOM where every exercise is done for seconds or
 * minutes. Its round times were always going to match, so they say nothing. */
export const fixedTime = (b: Block) => {
  const work = b.steps.filter(s => s.kind === 'exercise');
  return ((b.mode ?? 'rounds') === 'rounds' || b.mode === 'emom') && work.length > 0 && work.every(s => s.kind === 'exercise' && (s.forMode === 'seconds' || s.forMode === 'minutes'));
};
const blockOf = (r: Runsheet | undefined, id: string) => r?.items.find((i): i is Block => i.kind === 'block' && i.id === id);
/** The splits worth a round time: all of them, less the blocks the workout fixed the time of. */
const measuredSplits = (result: SessionResult, runsheet?: Runsheet) =>
  (result.splits ?? []).filter(sp => {
    const b = blockOf(runsheet, sp.blockId);
    return !(b && fixedTime(b));
  });

/** A spread under 5 s or 5% of the fastest is noise: 2:00 against 2:01 is not a fastest round. */
export const realSpread = (fastest: number, slowest: number) => slowest - fastest >= Math.max(5, fastest * 0.05);

/** Seconds each round took: from when its work began to its last tick, so the rest before a round is
 * not in it and round 1 is not always the fastest. A split kept before round starts were falls back
 * to the block's start (or the round before); round 1 of one kept before that has no time. */
export const roundTimes = (sp: RoundSplit): (number | undefined)[] =>
  sp.at.map((t, i) => {
    const from = sp.starts?.[i] ?? (i === 0 ? sp.from : sp.at[i - 1]);
    return from === undefined ? undefined : Math.max(0, Math.round(t - from));
  });

export interface RoundRow {
  blockId: string;
  /** Per round, seconds; undefined where it cannot be worked out. */
  times: (number | undefined)[];
  /** Index of the fastest and slowest round; unset with fewer than two timed rounds. */
  fastest?: number;
  slowest?: number;
  /** The same round last time minus this one's — negative is faster. Unset where either is missing. */
  vsLast: (number | undefined)[];
}

/** One row per split block, with the fastest and slowest rounds marked when they are really apart
 * and, given the last session of the same workout, each round against the same round then. Given
 * the workout, a block whose round time the timer fixed has no row. */
export const roundRows = (result: SessionResult, last?: SessionResult, runsheet?: Runsheet): RoundRow[] =>
  measuredSplits(result, runsheet).map(sp => {
    const times = roundTimes(sp);
    const timed = times.flatMap((t, i) => (t === undefined ? [] : [{ t, i }]));
    const prev = last?.splits?.find(x => x.blockId === sp.blockId);
    const before = prev ? roundTimes(prev) : [];
    const row: RoundRow = { blockId: sp.blockId, times, vsLast: times.map((t, i) => (t !== undefined && before[i] !== undefined ? t - before[i]! : undefined)) };
    if (timed.length > 1) {
      const fast = timed.reduce((a, b) => (b.t < a.t ? b : a));
      const slow = timed.reduce((a, b) => (b.t > a.t ? b : a));
      if (realSpread(fast.t, slow.t)) {
        row.fastest = fast.i;
        row.slowest = slow.i;
      }
    }
    return row;
  });

export interface AmountRow {
  blockId: string;
  stepId: string;
  exerciseKey: string;
  field: StepLog;
  /** Per round, what was logged; undefined where nothing was. */
  values: (number | undefined)[];
  /** Index of the round with the most; unset when no two rounds differ. */
  best?: number;
}

/**
 * What each round of a fixed-time block logged, for the steps set to log reps, metres or calories (a
 * row per measure: a rower logging both has two):
 * "Rower sprints: R1 142 m · R2 138 m · R3 145 m". A round is a working set of the step, in order.
 * Any difference earns "best" — the amount is what varied.
 */
export const amountRows = (result: SessionResult, runsheet?: Runsheet): AmountRow[] => {
  if (!runsheet) return [];
  const out: AmountRow[] = [];
  for (const b of runsheet.items) {
    if (b.kind !== 'block' || !fixedTime(b)) continue;
    for (const st of b.steps) {
      if (st.kind !== 'exercise') continue;
      const sets = result.steps.filter(r => r.stepId === st.id).flatMap(r => r.sets ?? []).filter(x => x.type !== 'warmup');
      for (const field of stepLogs(st)) {
        const values = sets.map(x => x[field]);
        const given = values.flatMap((v, i) => (v === undefined ? [] : [{ v, i }]));
        if (given.length < 2) continue;
        const row: AmountRow = { blockId: b.id, stepId: st.id, exerciseKey: st.exercise.key, field, values };
        const top = given.reduce((a, c) => (c.v > a.v ? c : a));
        if (given.some(x => x.v !== top.v)) row.best = top.i;
        out.push(row);
      }
    }
  }
  return out;
};

/** "142 m", "15 cal", "12 reps". */
export const fmtAmount = (v: number, field: StepLog) => (field === 'meters' ? `${v} m` : field === 'calories' ? `${v} cal` : `${v} ${v === 1 ? 'rep' : 'reps'}`);

export interface FastestRound {
  blockId: string;
  /** 0-based round. */
  round: number;
  seconds: number;
  /** startedAt of the session it was done in. */
  at: string;
}

/** The fastest round of each block across these sessions (ties keep the first). */
export const fastestRounds = (results: SessionResult[]): FastestRound[] => {
  const best = new Map<string, FastestRound>();
  for (const r of [...results].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    for (const sp of r.splits ?? []) {
      roundTimes(sp).forEach((t, round) => {
        if (t === undefined || t <= 0) return;
        const cur = best.get(sp.blockId);
        if (!cur || t < cur.seconds) best.set(sp.blockId, { blockId: sp.blockId, round, seconds: t, at: r.startedAt });
      });
    }
  }
  return [...best.values()];
};

const same = (a: SessionResult, b: SessionResult) => (a.id && b.id ? a.id === b.id : a.runsheetId === b.runsheetId && a.startedAt === b.startedAt);

/** A round of this session faster than any of the same block before it, in the same workout. Only a
 * standing record can be beaten, so the first time is not one. `was` is the record it beat. */
export interface RoundPR extends FastestRound {
  was: number;
}

export const roundPRs = (result: SessionResult, all: SessionResult[], runsheet?: Runsheet): RoundPR[] => {
  if (!result.splits?.length) return [];
  // A block whose round time the timer fixed has no fastest round to beat.
  const measured = new Set(measuredSplits(result, runsheet).map(sp => sp.blockId));
  const before = fastestRounds(all.filter(r => !same(r, result) && r.runsheetId === result.runsheetId && r.startedAt < result.startedAt));
  return fastestRounds([result]).flatMap(mine => {
    if (!measured.has(mine.blockId)) return [];
    const rec = before.find(b => b.blockId === mine.blockId);
    return rec && mine.seconds < rec.seconds ? [{ ...mine, was: rec.seconds }] : [];
  });
};
