/**
 * Racing last time: one signed number on the timer, "Round 4 — 12 s ahead". It compares the
 * session time at the latest round (circuits, AMRAPs) or set (straight sets, loose steps) done
 * now with the session time at the same round or set in the last session of this workout.
 * Pure; the timer calls it with the result so far.
 */
import type { SessionResult } from '@/features/runsheet/progression';

export interface Mark {
  key: string;
  label: string;
  /** Session time, seconds. */
  at: number;
}

export interface Ghost {
  label: string;
  /** Seconds ahead of last time; negative is behind. */
  delta: number;
  /** "Round 4 — 12 s ahead", "Set 2 — 8 s behind", "Round 1 — on pace". */
  text: string;
  /** The short form for the Lock Screen: "12 s ahead". */
  short: string;
}

/** Every timed point in a result. A step whose block has round splits is covered by them, so its
 * sets are not marks of their own. `blockOf` maps a step id to its block id. */
export const marks = (r: SessionResult, blockOf: (stepId: string) => string | undefined = () => undefined): Mark[] => {
  const split = new Set((r.splits ?? []).map(sp => sp.blockId));
  const out: Mark[] = [];
  for (const sp of r.splits ?? []) sp.at.forEach((at, i) => out.push({ key: `round:${sp.blockId}:${i}`, label: `Round ${i + 1}`, at }));
  for (const st of r.steps) {
    const block = blockOf(st.stepId);
    if (block && split.has(block)) continue;
    st.sets?.forEach((set, i) => {
      if (set.at !== undefined) out.push({ key: `set:${st.stepId}:${st.exerciseKey}:${i}`, label: `Set ${i + 1}`, at: set.at });
    });
  }
  return out;
};

/** The newest session of this workout with times kept, other than `excludeId`. */
export const lastTimed = (history: SessionResult[], runsheetId: string, excludeId?: string): SessionResult | undefined =>
  [...history]
    .filter(h => h.runsheetId === runsheetId && (excludeId === undefined || h.id !== excludeId) && !h.activity)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .find(h => marks(h).length > 0);

const span = (sec: number) => (sec < 60 ? `${sec} s` : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);

/**
 * The delta at the latest mark reached now that last time also reached. Undefined until the first
 * such mark, or with no last time. Blocks from the two sessions are matched on block id, so a round
 * of a block that has since been rebuilt compares only if its id held.
 */
export const ghost = (now: SessionResult, last: SessionResult | undefined, blockOf?: (stepId: string) => string | undefined): Ghost | undefined => {
  if (!last) return undefined;
  const then = new Map(marks(last, blockOf).map(m => [m.key, m]));
  const hit = marks(now, blockOf)
    .filter(m => then.has(m.key))
    .sort((a, b) => b.at - a.at)[0];
  if (!hit) return undefined;
  const delta = Math.round(then.get(hit.key)!.at - hit.at);
  const short = delta === 0 ? 'on pace' : `${span(Math.abs(delta))} ${delta > 0 ? 'ahead' : 'behind'}`;
  return { label: hit.label, delta, text: `${hit.label} — ${short}`, short };
};
