/**
 * Training maxes and progression, the two things free programs need to be more than lists.
 * Pure functions; the app keeps TMs per exercise key in local storage.
 */
import type { Block, ExerciseStep, Item, Progression, Runsheet } from './model';

/** kg per exercise key: a training max (5/3/1, nSuns) or last working weight (StrongLifts). */
export type TrainingMaxes = Record<string, number>;

/** Snap a load to what a gym can actually load: 2.5 kg steps for bars, the exercise's own step otherwise. */
export const snapLoad = (kg: number, step = 2.5) => Math.round(kg / step) * step;

/** The kg a step means for this user: absolute target, % of TM, or × bodyweight. */
export const resolveTarget = (s: ExerciseStep, tms: TrainingMaxes, bodyweightKg?: number): number | undefined => {
  if (s.targetPct !== undefined) {
    const tm = tms[s.exercise.key];
    return tm === undefined ? undefined : snapLoad((s.targetPct / 100) * tm, s.exercise.step || 2.5);
  }
  if (s.loadFactor !== undefined) return bodyweightKg === undefined ? undefined : snapLoad(s.loadFactor * bodyweightKg, s.exercise.step || 2.5);
  return s.target;
};

/** What was logged for one exercise step in a session. */
export interface StepResult {
  stepId: string;
  exerciseKey: string;
  /** Load actually used, kg (or the exercise unit). */
  target?: number;
  /** Reps achieved on the last set (amrap / max) or per set. */
  reps?: number[];
  /** Every prescribed set hit its reps. */
  success?: boolean;
}

export interface SessionResult {
  /** Stable id (sessions.id); assigned on first save. */
  id?: string;
  runsheetId: string;
  /** Title at the time, so history reads even if the workout is gone. */
  title?: string;
  startedAt: string;
  endedAt?: string;
  durationSec?: number;
  completed?: boolean;
  /** Quick-logged activity (padel, a run) rather than a runsheet. */
  activity?: { name: string; icon?: string; minutes: number; intensity?: string };
  /** Device heart-rate summary attached after sync (Fitbit / Google Health). */
  device?: { avgHr?: number; maxHr?: number; calories?: number; source?: string };
  /** The v0.9 row this came from, kept so edits push back a shape the old app reads. */
  legacy?: unknown;
  /** Score in the workout's score type: seconds, rounds (+ reps/1000), total reps, kg, metres. */
  score?: number;
  scoreText?: string;
  steps: StepResult[];
  notes?: string;
}

const exerciseSteps = (items: Item[]): ExerciseStep[] => items.flatMap(it => (it.kind === 'block' ? it.steps : it.kind === 'ref' ? [] : [it])).filter((s): s is ExerciseStep => s.kind === 'exercise');

/** Consecutive failures per exercise key, from the most recent sessions of this runsheet. */
export const failStreak = (history: SessionResult[], exerciseKey: string): number => {
  let n = 0;
  for (const h of [...history].sort((a, b) => b.startedAt.localeCompare(a.startedAt))) {
    const r = h.steps.find(s => s.exerciseKey === exerciseKey);
    if (!r || r.success === undefined) continue;
    if (r.success) break;
    n++;
  }
  return n;
};

export interface NextLoad {
  exerciseKey: string;
  name: string;
  from?: number;
  to?: number;
  reason: string;
}

/**
 * Apply a runsheet's progression rules to the last result and propose next-session loads.
 * Block-level rules override the runsheet's. Returns one line per exercise that changes.
 */
export const nextLoads = (r: Runsheet, last: SessionResult, history: SessionResult[] = [], tms: TrainingMaxes = {}): NextLoad[] => {
  const out: NextLoad[] = [];
  const seen = new Set<string>();
  const blocks = r.items.filter((i): i is Block => i.kind === 'block');
  for (const s of exerciseSteps(r.items)) {
    const key = s.exercise.key;
    if (seen.has(key)) continue;
    seen.add(key);
    const block = blocks.find(b => b.steps.some(x => x.id === s.id));
    const rule: Progression | undefined = block?.progression ?? r.progression;
    if (!rule) continue;
    const res = last.steps.find(x => x.stepId === s.id || x.exerciseKey === key);
    if (!res) continue;
    const from = res.target ?? resolveTarget(s, tms);
    // amrap-driven training max bump (5/3/1, GreySkull, nSuns)
    if (s.forMode === 'amrap' && rule.amrapBumpAt !== undefined && rule.tmBumpKg) {
      const reps = res.reps?.at(-1);
      if (reps !== undefined && reps >= rule.amrapBumpAt) {
        const tm = tms[key];
        out.push({ exerciseKey: key, name: s.exercise.name, from: tm, to: tm !== undefined ? tm + rule.tmBumpKg : undefined, reason: `${reps} reps on the ${s.forValue}+ set: training max +${rule.tmBumpKg} kg` });
        continue;
      }
    }
    if (res.success === undefined || from === undefined) continue;
    if (res.success && rule.onSuccessKg) {
      out.push({ exerciseKey: key, name: s.exercise.name, from, to: snapLoad(from + rule.onSuccessKg, s.exercise.step || 2.5), reason: `all sets done: +${rule.onSuccessKg} kg` });
    } else if (!res.success && rule.deloadPct && rule.failAfter) {
      const streak = failStreak([last, ...history.filter(h => h !== last)], key);
      if (streak >= rule.failAfter) out.push({ exerciseKey: key, name: s.exercise.name, from, to: snapLoad(from * (1 - rule.deloadPct / 100), s.exercise.step || 2.5), reason: `${streak} failed sessions: deload ${rule.deloadPct}%` });
      else out.push({ exerciseKey: key, name: s.exercise.name, from, to: from, reason: `missed reps (${streak}/${rule.failAfter}): repeat the weight` });
    }
  }
  return out;
};

/** Format a score for display given the runsheet's score type. */
export const fmtScore = (type: string, score?: number, text?: string) => {
  if (text) return text;
  if (score === undefined) return '';
  if (type === 'time') return `${Math.floor(score / 60)}:${String(Math.round(score % 60)).padStart(2, '0')}`;
  if (type === 'rounds') return `${Math.floor(score)} rounds${score % 1 ? ` + ${Math.round((score % 1) * 1000)} reps` : ''}`;
  if (type === 'reps') return `${score} reps`;
  if (type === 'load') return `${score} kg`;
  if (type === 'distance') return `${score} m`;
  return String(score);
};
