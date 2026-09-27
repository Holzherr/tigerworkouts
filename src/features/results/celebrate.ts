/**
 * What the finish screen leads with: which workout this was in the count, the streak, the records
 * set today and how it compares with the last time the same workout was done. Pure functions over
 * `SessionResult[]`; ported one for one to `ios/TigerWorkouts/Results/Celebrate.swift`.
 */
import { fmtClock } from '@/shared/utils/ui-utils';
import type { ScoreType } from '@/features/runsheet/model';
import { fmtScore, type SessionResult } from '@/features/runsheet/progression';
import { streak, type Streak } from './effort';
import { fmtNum, sessionPRs, sessionVolume, setsOf, type SessionPR } from './logbook';

export interface Celebration {
  /** 42 for the 42nd session ever logged, this one included. */
  ordinal: number;
  streak: Streak;
  prs: SessionPR[];
  /** Load × reps over the whole session. Undefined when nothing was both loaded and counted. */
  volume?: number;
  /** The previous session of the same workout, if there is one. */
  last?: SessionResult;
  /** This session minus the last one, per number both have. */
  deltas: { score?: number; durationSec?: number; volume?: number };
}

const same = (a: SessionResult, b: SessionResult) => (a.id && b.id ? a.id === b.id : a.runsheetId === b.runsheetId && a.startedAt === b.startedAt);

/** Load × reps across every exercise in the session. */
export const totalVolume = (r: SessionResult): number | undefined => {
  const vs = r.steps.map(s => sessionVolume({ sets: setsOf(s) })).filter((n): n is number => n !== undefined);
  return vs.length ? vs.reduce((a, b) => a + b, 0) : undefined;
};

/** `all` is every session logged, with or without this one in it. */
export const celebrate = (result: SessionResult, all: SessionResult[], today = new Date(result.startedAt)): Celebration => {
  const others = all.filter(r => !same(r, result));
  const before = others.filter(r => r.startedAt < result.startedAt);
  const last = result.activity ? undefined : before.filter(r => r.runsheetId === result.runsheetId && !r.activity).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const volume = totalVolume(result);
  const lastVolume = last && totalVolume(last);
  const diff = (a?: number, b?: number) => (a !== undefined && b !== undefined ? a - b : undefined);
  const deltas: Celebration['deltas'] = {};
  const score = diff(result.score, last?.score);
  const durationSec = diff(result.durationSec, last?.durationSec);
  const vol = diff(volume, lastVolume);
  if (score !== undefined) deltas.score = score;
  if (durationSec !== undefined) deltas.durationSec = durationSec;
  if (vol !== undefined) deltas.volume = vol;
  return {
    ordinal: before.length + 1,
    streak: streak([...others.filter(r => r.startedAt <= result.startedAt), result], today),
    prs: sessionPRs(result, all),
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

/** "Workout 42", "Workout 1". */
export const ordinalLabel = (n: number) => `Workout ${n}`;

/** "3 weeks running · 2 this week", or just "2 this week" before a streak exists. */
export const streakLabel = (s: Streak) => [s.weeks > 1 ? `${s.weeks} weeks running` : '', `${s.thisWeek} this week`].filter(Boolean).join(' · ');

/** "Heavy" words for the 1–10 effort scale, as Apple Health groups it. */
export const effortWord = (rpe: number) => (rpe <= 3 ? 'Easy' : rpe <= 6 ? 'Moderate' : rpe <= 8 ? 'Hard' : 'All out');

export { kg as fmtKg };
