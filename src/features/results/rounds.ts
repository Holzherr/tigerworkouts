/**
 * Round times from the splits the timer keeps: how long each round of a circuit, AMRAP or for-time
 * block took, the fastest and slowest, the same rounds last time, and the fastest round a workout
 * has ever had. Pure functions over `SessionResult[]`; ported one for one to
 * `ios/TigerWorkouts/Results/Rounds.swift`.
 */
import type { RoundSplit, SessionResult } from '@/features/runsheet/progression';

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

/** One row per split block, with the fastest and slowest rounds marked and, given the last session
 * of the same workout, each round against the same round then. */
export const roundRows = (result: SessionResult, last?: SessionResult): RoundRow[] =>
  (result.splits ?? []).map(sp => {
    const times = roundTimes(sp);
    const timed = times.flatMap((t, i) => (t === undefined ? [] : [{ t, i }]));
    const prev = last?.splits?.find(x => x.blockId === sp.blockId);
    const before = prev ? roundTimes(prev) : [];
    const row: RoundRow = { blockId: sp.blockId, times, vsLast: times.map((t, i) => (t !== undefined && before[i] !== undefined ? t - before[i]! : undefined)) };
    if (timed.length > 1) {
      row.fastest = timed.reduce((a, b) => (b.t < a.t ? b : a)).i;
      row.slowest = timed.reduce((a, b) => (b.t > a.t ? b : a)).i;
    }
    return row;
  });

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

export const roundPRs = (result: SessionResult, all: SessionResult[]): RoundPR[] => {
  if (!result.splits?.length) return [];
  const before = fastestRounds(all.filter(r => !same(r, result) && r.runsheetId === result.runsheetId && r.startedAt < result.startedAt));
  return fastestRounds([result]).flatMap(mine => {
    const rec = before.find(b => b.blockId === mine.blockId);
    return rec && mine.seconds < rec.seconds ? [{ ...mine, was: rec.seconds }] : [];
  });
};
