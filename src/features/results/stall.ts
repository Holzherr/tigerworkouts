/**
 * Stalls: an exercise (or a scored workout) whose best has not moved for a while, and two concrete
 * ways out. It needs history, not intelligence: the best set per session, the last session that set
 * a record, and how many sessions and weeks have passed since without beating it.
 *
 * Quiet by design. The app shows a stall in place — the exercise's logbook page, one line on the Up
 * next card — and a dismissed one stays dismissed. Pure; ported one for one to
 * `ios/TigerWorkouts/Results/Stall.swift`.
 */
import { ofWorkout, scoreType, shortUnit, type Block, type Runsheet } from '@/features/runsheet/model';
import { isWorking, type SessionResult, type SetResult } from '@/features/runsheet/progression';
import { clock } from '@/features/runsheet/targets';
import { exerciseHistory, fmtNum, kindOf, liftKind } from './logbook';

/** A stall needs the record session and at least three after it that did not beat it… */
export const STALL_SESSIONS = 4;
/** …spread over at least three weeks… */
export const STALL_DAYS = 21;
/** …and the newest of them recent enough to matter. */
export const STALL_FRESH_DAYS = 28;

const DAY = 864e5;

export interface Plateau {
  /** startedAt of the session that set the standing best. */
  since: string;
  /** Sessions from that one to the newest, both counted. */
  sessions: number;
  weeks: number;
  /** Index into the points of the session that set it. */
  index: number;
}

/**
 * Where a series stopped improving. Points are oldest first; a tie does not count as progress.
 * Undefined while the best is newer than `STALL_SESSIONS` sessions or `STALL_DAYS` days, or when
 * the newest point is older than `STALL_FRESH_DAYS`.
 */
export const plateau = (points: { at: string; value: number }[], now: Date, lowerIsBetter = false): Plateau | undefined => {
  if (points.length < STALL_SESSIONS) return undefined;
  const beats = (a: number, b: number) => (lowerIsBetter ? a < b : a > b);
  let k = 0;
  let best = points[0].value;
  points.forEach((p, i) => {
    if (i > 0 && beats(p.value, best)) {
      best = p.value;
      k = i;
    }
  });
  const sessions = points.length - k;
  const first = Date.parse(points[k].at);
  const last = Date.parse(points[points.length - 1].at);
  if (sessions < STALL_SESSIONS || last - first < STALL_DAYS * DAY || now.getTime() - last > STALL_FRESH_DAYS * DAY) return undefined;
  return { since: points[k].at, sessions, weeks: Math.floor((now.getTime() - first) / (7 * DAY)), index: k };
};

export interface StallOption {
  /** "Drop to 20 kg and build to 12 reps". */
  title: string;
  /** One line on how. */
  detail: string;
  /** Set when the option is another exercise, so the page can link it. */
  exerciseKey?: string;
}

export interface Stall {
  /** Stable while the same best stands: what a dismissal is keyed on. */
  id: string;
  exerciseKey?: string;
  runsheetId?: string;
  /** "24 kg × 8", "8 rounds", "11:40". */
  best: string;
  sessions: number;
  weeks: number;
  /** "At 24 kg × 8 for 5 weeks". */
  line: string;
  options: [StallOption, StallOption];
}

/** Uncapped Epley, so reps banked past 10 still read as progress; a stall is about direction, not a 1RM. */
const strength = (x: SetResult) => (x.load && x.reps ? (x.reps === 1 ? x.load : x.load * (1 + x.reps / 30)) : undefined);

export interface Swap {
  key: string;
  name: string;
  /** The load converted into its terms, if it has one. */
  target?: number;
  unit?: string;
}

const weeksText = (w: number) => (w === 1 ? 'a week' : `${w} weeks`);

/**
 * An exercise's stall and its two options: build back from lighter (or, for bodyweight, more sets
 * of fewer reps), and swap to the first alternative from the alternatives data (`swapFor`, given
 * the standing best's load) for three weeks. With no swap, the second option is the other
 * direction: heavier for fewer reps.
 */
export const exerciseStall = (results: SessionResult[], exercise: { key: string; name: string; unit: string; step: number }, now: Date, swapFor?: (load: number | undefined) => Swap | undefined): Stall | undefined => {
  const history = exerciseHistory(results, exercise.key, exercise.unit).reverse();
  const kind = kindOf(history);
  // Timed and distance work is not stalled on: a 40 s interval never grows.
  if (!liftKind(kind)) return undefined;
  const pick = (sets: SetResult[]): { value: number; set: SetResult } | undefined => {
    let out: { value: number; set: SetResult } | undefined;
    for (const x of sets.filter(isWorking)) {
      const v = kind === 'strength' ? strength(x) : kind === 'load' ? x.load : x.reps;
      if (v !== undefined && v > 0 && (!out || v > out.value)) out = { value: v, set: x };
    }
    return out;
  };
  const bests = history.map(s => ({ at: s.startedAt, best: pick(s.sets) })).filter((p): p is { at: string; best: { value: number; set: SetResult } } => !!p.best);
  const p = plateau(bests.map(b => ({ at: b.at, value: b.best.value })), now);
  if (!p) return undefined;
  // Bodyweight reps that never vary are a prescribed count in a circuit (Cindy's 10 push-ups a
  // round), not a max effort that stopped moving.
  const window = history.filter(h => h.startedAt >= p.since).flatMap(h => h.sets.filter(isWorking)).map(x => x.reps);
  if (kind === 'reps' && window.every(r => r === window[0])) return undefined;
  const set = bests[p.index].best.set;
  const unit = shortUnit(exercise.unit);
  const u = unit ? ` ${unit}` : '';
  const step = exercise.step || 2.5;
  const best = kind === 'strength' ? `${fmtNum(set.load!)}${u} × ${fmtNum(set.reps!)}` : kind === 'load' ? `${fmtNum(set.load!)}${u}` : `${fmtNum(set.reps!)} reps`;
  const swap = swapFor?.(set.load);
  const swapOption = (then: string): StallOption | undefined =>
    swap ? { title: `Swap to ${swap.name} for three weeks`, detail: `${swap.target !== undefined ? `Start around ${fmtNum(swap.target)}${swap.unit ? ` ${swap.unit}` : ''}. ` : ''}${then}`, exerciseKey: swap.key } : undefined;
  let options: [StallOption, StallOption];
  if (kind === 'reps') {
    const r = set.reps!;
    options = [
      { title: `Do 5 sets of ${Math.max(1, Math.ceil(r * 0.6))} for three weeks`, detail: `More sets, fewer reps each, then test a max set again.` },
      swapOption(`Then come back to ${exercise.name}.`) ?? { title: 'Add a 3 s pause at the bottom for three weeks', detail: `Same reps, slower. Then test a max set again.` },
    ];
  } else {
    const load = set.load!;
    const lower = Math.max(step, Math.min(load - step, Math.floor((load * 0.9) / step) * step));
    const lighter = Math.round(lower * 100) / 100;
    const heavier = Math.round((load + step) * 100) / 100;
    if (kind === 'strength') {
      const r = set.reps!;
      options = [
        { title: `Drop to ${fmtNum(lighter)}${u} and build to ${fmtNum(r + 4)} reps`, detail: `A rep a session, then back to ${fmtNum(load)}${u}.` },
        swapOption(`Then come back to ${exercise.name}.`) ?? { title: `Go heavier for three weeks: ${fmtNum(heavier)}${u} × ${fmtNum(Math.max(3, r - 3))}`, detail: `Fewer reps at the next load up, then back to ${fmtNum(r)}.` },
      ];
    } else {
      options = [
        { title: `Drop to ${fmtNum(lighter)}${u} and add a set`, detail: `Build the sets back, then return to ${fmtNum(load)}${u}.` },
        swapOption(`Then come back to ${exercise.name}.`) ?? { title: `Hold ${fmtNum(load)}${u} and add a round each week`, detail: 'Three weeks of more work at the same number.' },
      ];
    }
  }
  return { id: `x:${exercise.key}@${p.since}`, exerciseKey: exercise.key, best, sessions: p.sessions, weeks: p.weeks, line: `At ${best} for ${weeksText(p.weeks)}`, options };
};

/** A scored workout's stall: rounds or reps that stopped going up, a time that stopped coming down. */
export const workoutStall = (r: Runsheet, results: SessionResult[], now: Date): Stall | undefined => {
  const type = scoreType(r);
  if (type !== 'rounds' && type !== 'time' && type !== 'reps') return undefined;
  const rid = r.id ?? r.title;
  const mine = ofWorkout(r);
  const pts = results
    .filter(x => mine(x) && !x.activity && x.score !== undefined && x.score > 0 && (type !== 'time' || x.completed !== false))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map(x => ({ at: x.startedAt, value: x.score! }));
  const p = plateau(pts, now, type === 'time');
  if (!p) return undefined;
  const value = pts[p.index].value;
  const block = r.items.find((i): i is Block => i.kind === 'block' && (i.role ?? 'main') === 'main');
  const retest = new Date(now.getTime() + 21 * DAY).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const park: StallOption = { title: `Park it for three weeks, retest on ${retest}`, detail: 'Something else in its slot; come back fresh.' };
  let best: string;
  let pace: StallOption;
  if (type === 'time') {
    best = clock(value);
    const n = block?.mode === 'ladder' ? (block.ladder?.length ?? 0) : (block?.repeat ?? 0);
    pace = n > 1
      ? { title: `Even pace: ${clock((value - 5) / n)} a round`, detail: `Hold it from the first round, no faster, to finish under ${clock(value)}.` }
      : { title: 'Scale the load and chase the time', detail: `A step lighter for three weeks, then back to it.` };
  } else if (type === 'rounds') {
    const whole = Math.floor(value);
    best = `${whole} round${whole === 1 ? '' : 's'}`;
    const cap = block?.mode === 'amrap' ? block.timeCapSec : undefined;
    pace = cap
      ? { title: `Even pace: ${clock(cap / (whole + 1))} a round`, detail: `Hold it from the first round, no faster, for ${whole + 1}.` }
      : { title: 'Scale the load and chase the rounds', detail: 'A step lighter for three weeks, then back to it.' };
  } else {
    best = `${fmtNum(value)} reps`;
    pace = { title: 'Break it into sets from the start', detail: 'Stop two reps short of failure every set, rest 10 s.' };
  }
  return { id: `w:${rid}@${p.since}`, runsheetId: rid, best, sessions: p.sessions, weeks: p.weeks, line: `At ${best} for ${weeksText(p.weeks)}`, options: [pace, park] };
};
