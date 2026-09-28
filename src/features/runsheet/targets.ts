/**
 * Today's target, from history: what to aim for in a workout's own terms. Two kinds.
 *
 * Density, for timed work: an AMRAP, a for-time or a total-reps workout is compared with its last
 * three scores — more rounds or reps in the same window, or the same work in less time.
 *
 * Load × reps, for sets: increment-aware double progression. The weights you own are a hard
 * constraint (kettlebells jump 4 kg), so reps are banked at the current load until the set at the
 * next load would be no harder than what you already did, and only then does the load go up.
 *
 * `Intent` scales both: restore holds, maintain nudges, overreach pushes. Nothing here is stored or
 * enforced; ignoring a target costs nothing. Pure; ported one for one to
 * `ios/TigerWorkouts/Model/Targets.swift`. Programmes with their own progression rules keep
 * `nextLoads` (progression.ts), and these lines stand aside for the exercises it covers.
 */
import { ofWorkout, plannedSet, scoreType, shortUnit, type Block, type ExerciseStep, type Item, type Runsheet, type SetType } from './model';
import type { SessionResult, SetResult } from './progression';
import { nextLoadUp, type Equipment } from './plates';
import { lastSets } from './last-used';

export type Intent = 'restore' | 'maintain' | 'overreach';

export const INTENTS: { id: Intent; label: string; note: string }[] = [
  { id: 'restore', label: 'Restore', note: 'Match last time. For a tired week.' },
  { id: 'maintain', label: 'Maintain', note: 'A rep or a round more than last time.' },
  { id: 'overreach', label: 'Overreach', note: 'Two more, and a faster time.' },
];

const num = (n: number) => (Number.isInteger(n) ? `${n}` : `${Math.round(n * 10) / 10}`);
export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)];
const id = (r: Runsheet) => r.id ?? r.title;

// ── density ──

export interface ScoreTarget {
  kind: 'rounds' | 'time' | 'reps';
  /** Rounds or reps to reach, or seconds to finish under. */
  aim: number;
  /** The scores it was read from, oldest first. */
  recent: number[];
  /** "Aim for 8+ rounds", "Finish in under 11:40". */
  text: string;
  /** "Last 3 times: 7, 7, 8 rounds". */
  detail: string;
  /** Seconds a round at the aim, when the window or the round count is known. */
  pace?: number;
}

/** "7" or "7+5" for 7 rounds and 5 reps. */
const rounds = (score: number) => {
  const whole = Math.floor(score);
  const reps = Math.round((score - whole) * 1000);
  return reps ? `${whole}+${reps}` : `${whole}`;
};

const mainBlock = (r: Runsheet): Block | undefined => r.items.find((i): i is Block => i.kind === 'block' && (i.role ?? 'main') === 'main');

/**
 * The next score to aim for in a timed workout, from its last three. Undefined for a workout that
 * is not scored on rounds, time or reps, or has no scored history. A for-time score only counts
 * when the session ran to the end.
 */
export const scoreTarget = (r: Runsheet, results: SessionResult[], intent: Intent = 'maintain'): ScoreTarget | undefined => {
  const type = scoreType(r);
  if (type !== 'rounds' && type !== 'time' && type !== 'reps') return undefined;
  const recent = results
    .filter(x => ofWorkout(r)(x) && !x.activity && x.score !== undefined && x.score > 0 && (type !== 'time' || x.completed !== false))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .slice(-3)
    .map(x => x.score!);
  if (!recent.length) return undefined;
  const when = recent.length === 1 ? 'Last time' : `Last ${recent.length} times`;
  const block = mainBlock(r);
  if (type === 'time') {
    const best = Math.min(...recent);
    const aim = intent === 'restore' ? median(recent) : intent === 'overreach' ? best - Math.max(5, Math.round((best * 0.03) / 5) * 5) : best;
    const n = block?.mode === 'ladder' ? (block.ladder?.length ?? 0) : (block?.repeat ?? 0);
    return { kind: 'time', aim, recent, text: `Finish in under ${clock(aim)}`, detail: `${when}: ${recent.map(clock).join(', ')}`, ...(n > 1 ? { pace: aim / n } : {}) };
  }
  if (type === 'rounds') {
    const best = Math.max(...recent);
    const aim = intent === 'restore' ? Math.floor(median(recent)) : intent === 'overreach' ? Math.floor(best) + 1 : Math.ceil(best);
    const cap = block?.mode === 'amrap' ? block.timeCapSec : undefined;
    const said = recent.map(rounds);
    return { kind: 'rounds', aim, recent, text: `Aim for ${aim}+ ${aim === 1 ? 'round' : 'rounds'}`, detail: `${when}: ${said.join(', ')} ${said.length === 1 && said[0] === '1' ? 'round' : 'rounds'}`, ...(cap && aim > 0 ? { pace: cap / aim } : {}) };
  }
  const best = Math.max(...recent);
  const aim = intent === 'restore' ? median(recent) : intent === 'overreach' ? best + Math.max(2, Math.round(best * 0.05)) : best + 1;
  return { kind: 'reps', aim, recent, text: `Aim for ${aim}+ reps`, detail: `${when}: ${recent.map(num).join(', ')} reps` };
};

// ── load × reps ──

/**
 * The reps at `load` that equal `reps` at the next load up, by Epley — where banking stops and the
 * jump is no harder than what was done. At least one more than `reps`, at most double: a 4 kg bell
 * is a 100% jump from 4 kg, and nobody should bank 46 reps.
 */
export const bankTop = (load: number, step: number, reps: number): number => {
  const even = 30 * (((load + step) / load) * (1 + reps / 30) - 1);
  return Math.min(Math.max(reps + 1, Math.ceil(even - 1e-9)), reps * 2);
};

export interface SetTarget {
  stepId: string;
  exerciseKey: string;
  name: string;
  /** Load for today, in the exercise unit; unset for bodyweight. */
  load?: number;
  /** Reps per set, in order. */
  reps: number[];
  /** True when today is the step up to the next load. */
  jump: boolean;
  /** "24 kg × 10, 10, 9", "28 kg × 8", "12 reps". */
  text: string;
  /** "bank reps: 28 kg once every set reaches 14". */
  reason: string;
}

const repsText = (reps: number[]) => (reps.every(n => n === reps[0]) ? num(reps[0]) : reps.map(num).join(', '));

/** A per-set plan whose working sets differ (a pyramid, ramping sets). Warm-ups before straight
 * sets do not make one. */
const pyramid = (s: ExerciseStep): boolean => {
  const work = (s.sets ?? []).flatMap((p, i) => (p.type === 'warmup' ? [] : [plannedSet(s, i)]));
  return work.some(p => p.reps !== work[0].reps || p.load !== work[0].load);
};

/**
 * Today's sets for one step, from its sets last time. Only steps counted in reps whose load is
 * theirs to change: no pyramid, no load relative to a training max or bodyweight, nothing on a
 * speed. `last` is what `lastSets` returns; its warm-ups and drop sets are not the work, so they are
 * left out. The next load up is the next one `kit` can make (a 24 kg bell goes to 28, not 26.5).
 */
export const setTarget = (s: ExerciseStep, lastAll: SetResult[] | undefined, intent: Intent = 'maintain', kit?: Equipment): SetTarget | undefined => {
  const last = lastAll?.filter(x => x.type !== 'warmup' && x.type !== 'drop');
  if (!last?.length || pyramid(s) || s.targetPct !== undefined || s.loadFactor !== undefined) return undefined;
  if (s.forMode !== 'reps' && s.forMode !== 'amrap' && s.forMode !== 'max') return undefined;
  const unit = shortUnit(s.exercise.unit);
  if (unit === 'kph') return undefined;
  const base = { stepId: s.id, exerciseKey: s.exercise.key, name: s.exercise.name };
  const loads = last.map(x => x.load ?? 0);
  const top = Math.max(...loads);
  const add = intent === 'restore' ? 0 : intent === 'overreach' ? 2 : 1;
  if (top <= 0 || !unit) {
    const done = last.map(x => x.reps).filter((n): n is number => n !== undefined && n > 0);
    if (!done.length) return undefined;
    const reps = done.map(n => n + add);
    return { ...base, reps, jump: false, text: `${repsText(reps)} reps`, reason: add ? `${add === 1 ? 'a rep' : `${add} reps`} more a set than last time` : 'what you did last time' };
  }
  if (s.forMode !== 'reps') return undefined;
  const working = last.filter(x => x.load === top && x.reps !== undefined && x.reps > 0).map(x => x.reps!);
  if (!working.length) return undefined;
  const up = nextLoadUp(top, s.exercise, kit);
  const bottom = s.forValue;
  const ceiling = s.forMax ?? (up !== undefined ? bankTop(top, up - top, bottom) : bottom * 2);
  const next = up !== undefined ? Math.round(up * 100) / 100 : top;
  const u = unit ? ` ${unit}` : '';
  if (up !== undefined && intent !== 'restore' && working.every(n => n >= ceiling)) {
    const reps = working.map(() => bottom);
    return { ...base, load: next, reps, jump: true, text: `${num(next)}${u} × ${repsText(reps)}`, reason: `${num(ceiling)} reps at ${num(top)}${u} on every set: up to ${num(next)}${u}` };
  }
  // A rep or two more a set, never past the ceiling, never fewer than was done.
  const reps = working.map(n => Math.max(n, Math.min(ceiling, n + add)));
  const why = up === undefined ? `bank reps: ${num(top)}${u} is the heaviest you own` : `bank reps: ${num(next)}${u} once every set reaches ${num(ceiling)}`;
  return { ...base, load: top, reps, jump: false, text: `${num(top)}${u} × ${repsText(reps)}`, reason: add ? why : 'what you did last time' };
};

const exerciseSteps = (items: Item[]): ExerciseStep[] => items.flatMap(it => (it.kind === 'block' ? it.steps : it.kind === 'ref' ? [] : [it])).filter((s): s is ExerciseStep => s.kind === 'exercise');

/** A programme's own progression rule covers this step: the runsheet's, or its block's. */
export const ruled = (r: Runsheet, s: ExerciseStep) => !!r.progression || r.items.some(i => i.kind === 'block' && !!i.progression && i.steps.some(x => x.id === s.id));

/** A target per step, first step of each exercise only, skipping warm-ups and steps a programme's
 * own progression rules already move. */
export const setTargets = (r: Runsheet, results: SessionResult[], intent: Intent = 'maintain', kit?: Equipment): SetTarget[] => {
  const seen = new Set<string>();
  const out: SetTarget[] = [];
  for (const s of exerciseSteps(r.items)) {
    if (seen.has(s.exercise.key) || (s.role ?? 'main') !== 'main' || ruled(r, s)) continue;
    seen.add(s.exercise.key);
    const t = setTarget(s, lastSets(results, s), intent, kit);
    if (t) out.push(t);
  }
  return out;
};

export interface Today {
  /** "Aim for 8+ rounds", "Barbell bench press 62.5 kg × 8". */
  text: string;
  detail: string;
  score?: ScoreTarget;
  sets: SetTarget[];
}

/** The one line for the Up next card and the top of the workout page: the score target if the
 * workout is scored, else the first exercise with a target. */
export const today = (r: Runsheet, results: SessionResult[], intent: Intent = 'maintain', kit?: Equipment): Today | undefined => {
  const score = scoreTarget(r, results, intent);
  const sets = score ? [] : setTargets(r, results, intent, kit);
  if (score) return { text: score.text, detail: score.detail, score, sets };
  const first = sets[0];
  if (!first) return undefined;
  const more = sets.length > 1 ? ` · ${sets.length - 1} more on the workout page` : '';
  return { text: `${first.name} ${first.text}`, detail: `${first.reason}${more}`, sets };
};

/**
 * The target for where the timer is: the score's pace for a round of the main block, or the set's
 * load × reps for a straight set. Small, beside the race against last time.
 */
export const timerTarget = (t: Today | undefined, at: { blockId?: string; stepId?: string; round: number; type?: SetType; set?: number }, r: Runsheet): string | undefined => {
  if (!t) return undefined;
  const main = mainBlock(r);
  if (t.score && main && at.blockId === main.id) {
    const pace = t.score.pace ? ` · ${clock(t.score.pace)} a round` : '';
    return t.score.kind === 'time' ? `Target ${clock(t.score.aim)}${pace}` : `Target ${t.score.aim}+${pace}`;
  }
  const set = t.sets.find(x => x.stepId === at.stepId);
  // A warm-up or a drop set has no target: the target is for the work. `set` counts the working
  // sets before this one, so a warm-up first does not shift the reps.
  if (!set || at.type === 'warmup' || at.type === 'drop') return undefined;
  const reps = set.reps[Math.min(at.set ?? at.round, set.reps.length - 1)];
  return set.load !== undefined ? `Target ${num(set.load)} × ${num(reps)}` : `Target ${num(reps)} reps`;
};

export interface NextTimeLine {
  key: string;
  name: string;
  text: string;
  reason: string;
}

/**
 * The finish screen's "Next time", read as if the session just done were the newest: the score to
 * aim for, then a line per exercise not already moved by `nextLoads` (`covered`).
 */
export const nextTime = (r: Runsheet, done: SessionResult, history: SessionResult[], intent: Intent = 'maintain', covered: string[] = [], kit?: Equipment): NextTimeLine[] => {
  const all = [...history.filter(h => h !== done && (h.id === undefined || h.id !== done.id)), { ...done, runsheetId: done.runsheetId || id(r) }];
  const out: NextTimeLine[] = [];
  const score = scoreTarget(r, all, intent);
  if (score) out.push({ key: 'score', name: r.title, text: score.text, reason: score.detail });
  if (!score) for (const s of setTargets(r, all, intent, kit)) if (!covered.includes(s.exerciseKey)) out.push({ key: s.exerciseKey, name: s.name, text: s.text, reason: s.reason });
  return out;
};
