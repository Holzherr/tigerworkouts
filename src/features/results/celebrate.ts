/**
 * What the finish screen leads with: which workout this was in the count, the streak, the records
 * set today and how it compares with the last time the same workout was done. Pure functions over
 * `SessionResult[]`; ported one for one to `ios/TigerWorkouts/Results/Celebrate.swift`.
 */
import { fmtClock } from '@/shared/utils/ui-utils';
import type { ScoreType } from '@/features/runsheet/model';
import { fmtScore, type SessionResult } from '@/features/runsheet/progression';
import { streak, type Streak } from './effort';
import { roundPRs, type RoundPR } from './rounds';
import { fmtNum, sessionPRs, sessionVolume, setsOf, type SessionPR } from './logbook';

export interface Celebration {
  /** 42 for the 42nd session ever logged, this one included. */
  ordinal: number;
  streak: Streak;
  prs: SessionPR[];
  /** A round faster than any before it in this workout, per block. */
  rounds: RoundPR[];
  /** Load × reps over the whole session. Undefined when nothing was both loaded and counted. */
  volume?: number;
  /** The previous session of the same workout, if there is one. */
  last?: SessionResult;
  /** This session minus the last one, per number both have. */
  deltas: { score?: number; durationSec?: number; volume?: number };
}

const same = (a: SessionResult, b: SessionResult) => (a.id && b.id ? a.id === b.id : a.runsheetId === b.runsheetId && a.startedAt === b.startedAt);

/** Load × reps across every exercise in the session. */
export const totalVolume = (r: SessionResult, unitOf: (key: string) => string | undefined = () => undefined): number | undefined => {
  const vs = r.steps.map(s => sessionVolume({ sets: setsOf(s, unitOf(s.exerciseKey)) })).filter((n): n is number => n !== undefined);
  return vs.length ? vs.reduce((a, b) => a + b, 0) : undefined;
};

/** `all` is every session logged, with or without this one in it. `unitOf` gives an exercise's
 * unit, for rows that logged metres, seconds or calories as a load. */
export const celebrate = (result: SessionResult, all: SessionResult[], today = new Date(result.startedAt), unitOf: (key: string) => string | undefined = () => undefined): Celebration => {
  const others = all.filter(r => !same(r, result));
  const before = others.filter(r => r.startedAt < result.startedAt);
  const last = result.activity ? undefined : before.filter(r => r.runsheetId === result.runsheetId && !r.activity).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const volume = totalVolume(result, unitOf);
  const lastVolume = last && totalVolume(last, unitOf);
  const diff = (a?: number, b?: number) => (a !== undefined && b !== undefined ? a - b : undefined);
  const deltas: Celebration['deltas'] = {};
  // A capped for-time scored the cap, not a finish time: nothing to set against a finish.
  const score = result.capped || last?.capped ? undefined : diff(result.score, last?.score);
  const durationSec = diff(result.durationSec, last?.durationSec);
  const vol = diff(volume, lastVolume);
  if (score !== undefined) deltas.score = score;
  if (durationSec !== undefined) deltas.durationSec = durationSec;
  if (vol !== undefined) deltas.volume = vol;
  return {
    ordinal: before.length + 1,
    streak: streak([...others.filter(r => r.startedAt <= result.startedAt), result], today),
    prs: sessionPRs(result, all, unitOf),
    rounds: roundPRs(result, all),
    ...(volume !== undefined ? { volume } : {}),
    ...(last ? { last } : {}),
    deltas,
  };
};

export interface DeltaLine {
  label: string;
  text: string;
  /** True when this is the better direction, false when worse, undefined when neither (duration, a tie). */
  better?: boolean;
}

const kg = (n: number) => (Math.abs(n) >= 1000 ? `${fmtNum(Math.round(Math.abs(n) / 100) / 10)} t` : `${fmtNum(Math.round(Math.abs(n)))} kg`);

/**
 * The comparison lines under "vs last time". Time scores are better when lower; every other score
 * and volume when higher. Duration only says longer or shorter: neither is better by itself.
 */
export const deltaLines = (c: Celebration, type: ScoreType): DeltaLine[] => {
  const out: DeltaLine[] = [];
  const { score, durationSec, volume } = c.deltas;
  if (score !== undefined && type !== 'none') {
    if (score === 0) out.push({ label: 'Score', text: 'Same as last time' });
    else if (type === 'time') out.push({ label: 'Score', text: `${fmtClock(Math.abs(score))} ${score < 0 ? 'faster' : 'slower'}`, better: score < 0 });
    else if (type === 'rounds' && c.last?.score !== undefined) out.push(roundsDelta(c.last.score + score, c.last.score));
    else out.push({ label: 'Score', text: `${score > 0 ? '+' : '−'}${fmtScore(type, Math.round(Math.abs(score) * 1000) / 1000)}`, better: score > 0 });
  }
  if (volume !== undefined) {
    out.push(volume === 0 ? { label: 'Volume', text: 'Same as last time' } : { label: 'Volume', text: `${volume > 0 ? '+' : '−'}${kg(volume)}`, better: volume > 0 });
  }
  if (durationSec !== undefined && Math.abs(durationSec) >= 30) {
    const a = Math.abs(durationSec);
    out.push({ label: 'Time', text: `${a < 60 ? `${Math.round(a)}s` : `${Math.round(a / 60)} min`} ${durationSec > 0 ? 'longer' : 'shorter'}` });
  }
  return out;
};

/** An AMRAP score is rounds + reps / 1000, so the two are set against each other apart: 7 + 3 on
 * 6 + 15 is "+1 round − 12 reps", never a subtraction of the encoded numbers. A partial round is
 * always fewer reps than a round, so more rounds is better whatever the reps. */
const roundsDelta = (now: number, was: number): DeltaLine => {
  const split = (x: number) => [Math.floor(x + 1e-9), Math.round((x - Math.floor(x + 1e-9)) * 1000)];
  const [r1, p1] = split(now);
  const [r0, p0] = split(was);
  const dr = r1 - r0;
  const dp = p1 - p0;
  const part = (n: number, one: string, many: string) => `${Math.abs(n)} ${Math.abs(n) === 1 ? one : many}`;
  const parts = [dr ? `${dr > 0 ? '+' : '−'}${part(dr, 'round', 'rounds')}` : '', dp ? `${dr ? (dp > 0 ? '+ ' : '− ') : dp > 0 ? '+' : '−'}${part(dp, 'rep', 'reps')}` : ''].filter(Boolean);
  return { label: 'Score', text: parts.length ? parts.join(' ') : 'Same as last time', ...(parts.length ? { better: dr > 0 || (dr === 0 && dp > 0) } : {}) };
};

/** "Workout 42", "Workout 1". */
export const ordinalLabel = (n: number) => `Workout ${n}`;

/** "3 weeks running · 2 this week", or just "2 this week" before a streak exists. */
export const streakLabel = (s: Streak) => [s.weeks > 1 ? `${s.weeks} weeks running` : '', `${s.thisWeek} this week`].filter(Boolean).join(' · ');

/** "Heavy" words for the 1–10 effort scale, as Apple Health groups it. */
export const effortWord = (rpe: number) => (rpe <= 3 ? 'Easy' : rpe <= 6 ? 'Moderate' : rpe <= 8 ? 'Hard' : 'All out');

export { kg as fmtKg };
