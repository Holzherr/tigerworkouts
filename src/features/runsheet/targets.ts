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
import { ofWorkout, plannedSet, scoreType, shortUnit, type Block, type ExerciseStep, type Item, type Progression, type Runsheet, type SetType } from './model';
import { ruleNext, type SessionResult, type SetResult } from './progression';
import { nextLoadUp, type Equipment } from './plates';
import { lastSets } from './last-used';
import { fmtWeight, loadDelta, loadText, unitText } from '@/shared/utils/units';
import { modeFor, suggestOn, type SuggestPrefs } from '@/features/results/suggestions';

export type Intent = 'restore' | 'maintain' | 'overreach';

/** How a lift moves on: reps (double progression, the default), weight at the plan's reps, or by
 * effort (RPE). Per account and per exercise (`prefs.suggestions`, results/suggestions.ts). Port of
 * `ProgressMode` in Suggestions.swift. */
export type ProgressMode = 'reps' | 'weight' | 'effort';

/** The RPE a set has to come down to before the weight goes up: 7, 8 on overreach. */
export const easyRpe = (intent: Intent) => (intent === 'overreach' ? 8 : 7);

export const INTENTS: { id: Intent; label: string; note: string }[] = [
  { id: 'restore', label: 'Restore', note: 'Match last time. For a tired week.' },
  { id: 'maintain', label: 'Maintain', note: 'A rep or a round more than last time.' },
  { id: 'overreach', label: 'Overreach', note: 'Two more, and a faster time.' },
];

const num = (n: number) => (Number.isInteger(n) ? `${n}` : `${Math.round(n * 10) / 10}`);
// Round the whole, not the seconds: 119.6 s is "2:00", never "1:60".
export const clock = (sec: number) => {
  const t = Math.round(sec);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
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
  /** What changed from last time: "+2.5 kg", "+1 rep/set". Unset when nothing moved. */
  delta?: string;
}

const maxRpe = (sets: SetResult[]): number | undefined => {
  const all = sets.map(x => x.rpe).filter((n): n is number => n !== undefined);
  return all.length ? Math.max(...all) : undefined;
};

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
export const setTarget = (s: ExerciseStep, lastAll: SetResult[] | undefined, intent: Intent = 'maintain', kit?: Equipment, mode: ProgressMode = 'reps'): SetTarget | undefined => {
  const last = lastAll?.filter(x => x.type !== 'warmup' && x.type !== 'drop');
  if (!last?.length || pyramid(s) || s.targetPct !== undefined || s.loadFactor !== undefined) return undefined;
  if (s.forMode !== 'reps' && s.forMode !== 'amrap' && s.forMode !== 'max') return undefined;
  const unit = shortUnit(s.exercise.unit);
  if (unit === 'kph') return undefined;
  const base = { stepId: s.id, exerciseKey: s.exercise.key, name: s.exercise.name };
  // Read set by set: straight sets (one load) only. Ramping sets, a pyramid or an odd single at the
  // end get no target, as the timer gives a pyramid none — the heaviest set is never the working weight.
  const loads = last.map(x => x.load ?? 0);
  if (new Set(loads).size > 1) return undefined;
  const top = loads[0];
  const add = intent === 'restore' ? 0 : intent === 'overreach' ? 2 : 1;
  if (top <= 0 || !unit) {
    const done = last.map(x => x.reps).filter((n): n is number => n !== undefined && n > 0);
    if (!done.length) return undefined;
    if (mode === 'effort') {
      const rpe = maxRpe(last);
      if (rpe !== undefined && intent !== 'restore' && rpe <= easyRpe(intent)) {
        const reps = done.map(n => n + 1);
        return { ...base, reps, jump: false, text: `${repsText(reps)} reps`, reason: `RPE ${num(rpe)} last time: a rep more a set` };
      }
      return { ...base, reps: done, jump: false, text: `${repsText(done)} reps`, reason: rpe === undefined ? 'same as last time · rate how hard it was at the finish' : 'same as last time' };
    }
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
  const u = unit ? ` ${unitText(unit)}` : '';
  const w = (n: number) => loadText(n, unit);
  if (mode === 'weight') {
    const want = s.forValue;
    const reps = working.map(() => want);
    if (up !== undefined && intent !== 'restore' && working.every(n => n >= want)) {
      const to = intent === 'overreach' ? nextLoadUp(up, s.exercise, kit) ?? up : up;
      const n = Math.round(to * 100) / 100;
      return { ...base, load: n, reps, jump: true, text: `${w(n)}${u} × ${repsText(reps)}`, reason: `${num(want)} reps at ${w(top)}${u} on every set: up to ${w(n)}${u}` };
    }
    const reason = intent === 'restore' ? 'same weight as last time' : up === undefined ? `${w(top)}${u} is the heaviest you own: hold it` : `hold ${w(top)}${u} until every set makes ${num(want)}`;
    return { ...base, load: top, reps, jump: false, text: `${w(top)}${u} × ${repsText(reps)}`, reason };
  }
  if (mode === 'effort') {
    const rpe = maxRpe(last.filter(x => x.load === top));
    const easy = easyRpe(intent);
    if (rpe !== undefined && up !== undefined && intent !== 'restore' && rpe <= easy) {
      return { ...base, load: next, reps: working, jump: true, text: `${w(next)}${u} × ${repsText(working)}`, reason: `RPE ${num(rpe)} at ${w(top)}${u}: up to ${w(next)}${u}, same reps` };
    }
    const reason = rpe === undefined ? 'same as last time · rate how hard it was at the finish'
      : up === undefined ? `RPE ${num(rpe)} · ${w(top)}${u} is the heaviest you own`
      : intent === 'restore' ? 'same as last time' : `RPE ${num(rpe)} last time: more weight once it is ${num(easy)} or less`;
    return { ...base, load: top, reps: working, jump: false, text: `${w(top)}${u} × ${repsText(working)}`, reason };
  }
  if (up !== undefined && intent !== 'restore' && working.every(n => n >= ceiling)) {
    const reps = working.map(() => bottom);
    return { ...base, load: next, reps, jump: true, text: `${w(next)}${u} × ${repsText(reps)}`, reason: `${num(ceiling)} reps at ${w(top)}${u} on every set: up to ${w(next)}${u}` };
  }
  // A rep or two more a set, never past the ceiling, never fewer than was done.
  const reps = working.map(n => Math.max(n, Math.min(ceiling, n + add)));
  const why = up === undefined ? `bank reps: ${w(top)}${u} is the heaviest you own` : `bank reps: ${w(next)}${u} once every set reaches ${num(ceiling)}`;
  return { ...base, load: top, reps, jump: false, text: `${w(top)}${u} × ${repsText(reps)}`, reason: add ? why : 'what you did last time' };
};

/**
 * The change on today's target against last time's working sets: the load if it moves ("+2.5 kg"),
 * else the reps ("+1 rep/set" when every set gains the same, else the total). Port of
 * `TodayLine.delta` in TargetViews.swift.
 */
export const targetDelta = (t: Pick<SetTarget, 'load' | 'reps'>, last: SetResult[] | undefined, unit: string): string | undefined => {
  const work = (last ?? []).filter(x => x.type !== 'warmup' && x.type !== 'drop');
  if (!work.length) return undefined;
  const loads = work.map(x => x.load).filter((n): n is number => n !== undefined);
  const top = loads.length ? Math.max(...loads) : undefined;
  const sign = (d: number) => (d > 0 ? '+' : '−');
  if (t.load !== undefined && top !== undefined && top > 0 && t.load !== top) {
    return loadDelta(t.load - top, unit);
  }
  const before = work.filter(x => top === undefined || x.load === top).map(x => x.reps).filter((n): n is number => n !== undefined);
  if (!before.length || before.length !== t.reps.length) return undefined;
  const diffs = t.reps.map((n, i) => n - before[i]);
  const each = diffs.every(d => d === diffs[0]);
  const d = each ? diffs[0] : diffs.reduce((a, b) => a + b, 0);
  if (d === 0) return undefined;
  return `${sign(d)}${num(Math.abs(d))} rep${Math.abs(d) === 1 ? '' : 's'}${each && diffs.length > 1 ? '/set' : ''}`;
};

const exerciseSteps = (items: Item[]): ExerciseStep[] => items.flatMap(it => (it.kind === 'block' ? it.steps : it.kind === 'ref' ? [] : [it])).filter((s): s is ExerciseStep => s.kind === 'exercise');

/** A programme's own progression rule covers this step: the runsheet's, or its block's. */
export const ruled = (r: Runsheet, s: ExerciseStep) => !!r.progression || r.items.some(i => i.kind === 'block' && !!i.progression && i.steps.some(x => x.id === s.id));

/** A target per step, first step of each exercise only, skipping warm-ups and steps a programme's
 * own progression rules already move. None while suggestions are off for the account or this
 * workout; each exercise moves by its own mode (`suggest`). */
export const setTargets = (r: Runsheet, results: SessionResult[], intent: Intent = 'maintain', kit?: Equipment, suggest?: SuggestPrefs): SetTarget[] => {
  if (!suggestOn(suggest, r)) return [];
  const seen = new Set<string>();
  const out: SetTarget[] = [];
  for (const s of exerciseSteps(r.items)) {
    if (seen.has(s.exercise.key) || (s.role ?? 'main') !== 'main' || ruled(r, s)) continue;
    seen.add(s.exercise.key);
    const last = lastSets(results, s, r);
    const t = setTarget(s, last, intent, kit, modeFor(suggest, s.exercise.key));
    if (t) out.push({ ...t, delta: targetDelta(t, last, shortUnit(s.exercise.unit)) });
  }
  return out;
};

const ruleOf = (r: Runsheet, s: ExerciseStep): Progression | undefined => r.items.find((i): i is Block => i.kind === 'block' && i.steps.some(x => x.id === s.id))?.progression ?? r.progression;

/**
 * Today for the lifts a program's own rule moves (review D16): the load the rule gives the next
 * session, at the program's reps, with the change in brackets. "Squat 42.5 kg × 5 (+2.5 kg)". The
 * same numbers the timer starts on (`progressed`). First step of each exercise, main work only.
 */
export const ruleTargets = (r: Runsheet, results: SessionResult[], kit?: Equipment): SetTarget[] => {
  const seen = new Set<string>();
  const out: SetTarget[] = [];
  for (const s of exerciseSteps(r.items)) {
    if (seen.has(s.exercise.key) || (s.role ?? 'main') !== 'main' || !ruled(r, s)) continue;
    seen.add(s.exercise.key);
    if (s.forMode !== 'reps') continue;
    const next = ruleNext(r, s, results, {}, kit);
    if (!next) continue;
    const unit = shortUnit(s.exercise.unit);
    const u = unit ? ` ${unitText(unit)}` : '';
    const block = r.items.find((i): i is Block => i.kind === 'block' && i.steps.some(x => x.id === s.id));
    const d = Math.round((next.to - next.from) * 100) / 100;
    out.push({
      stepId: s.id,
      exerciseKey: s.exercise.key,
      name: s.exercise.name,
      load: next.to,
      reps: Array.from({ length: Math.max(1, block?.repeat ?? 1) }, () => s.forValue),
      jump: d > 0,
      text: `${loadText(next.to, unit)}${u} × ${num(s.forValue)}`,
      reason: next.reason,
      ...(d !== 0 ? { delta: loadDelta(d, unit) } : {}),
    });
  }
  return out;
};

/**
 * A program's rule in its own words, from the data: "every set made, add 2.5 kg", with the lifts
 * that move by another step in brackets ("deadlift 5 kg").
 */
export const ruleText = (r: Runsheet): string | undefined => {
  const seen = new Set<string>();
  const steps: { name: string; kg: number }[] = [];
  for (const s of exerciseSteps(r.items)) {
    const kg = ruleOf(r, s)?.onSuccessKg;
    if (seen.has(s.exercise.key) || !kg) continue;
    seen.add(s.exercise.key);
    steps.push({ name: s.exercise.name, kg });
  }
  if (!steps.length) return undefined;
  const count = (kg: number) => steps.filter(x => x.kg === kg).length;
  const usual = [...steps].sort((a, b) => count(b.kg) - count(a.kg))[0].kg;
  const others = steps.filter(x => x.kg !== usual).map(x => `${x.name.toLowerCase()} ${fmtWeight(x.kg)}`);
  return `every set made, add ${fmtWeight(usual)}${others.length ? ` (${others.join(', ')})` : ''}`;
};

export interface Today {
  /** "Aim for 8+ rounds", "Barbell bench press 62.5 kg × 8". */
  text: string;
  detail: string;
  /** The change on the first target against last time, for the brackets: "+2.5 kg". */
  delta?: string;
  /** Set when the lifts follow the program's own rule: "every set made, add 2.5 kg". Today then
   * reads a line per lift. */
  rule?: string;
  score?: ScoreTarget;
  sets: SetTarget[];
}

/** The one line for the Up next card and the top of the workout page: the score target if the
 * workout is scored, else the first exercise with a target. */
export const today = (r: Runsheet, results: SessionResult[], intent: Intent = 'maintain', kit?: Equipment, suggest?: SuggestPrefs): Today | undefined => {
  if (!suggestOn(suggest, r)) return undefined;
  const score = scoreTarget(r, results, intent);
  if (score) return { text: score.text, detail: score.detail, score, sets: [] };
  // The lifts a program's rule moves follow the rule; everything else follows the setting. In
  // workout order.
  const order = exerciseSteps(r.items).map(s => s.id);
  const byRule = ruleTargets(r, results, kit);
  const sets = [...byRule, ...setTargets(r, results, intent, kit, suggest)].sort((a, b) => order.indexOf(a.stepId) - order.indexOf(b.stepId));
  const first = sets[0];
  if (!first) return undefined;
  const more = sets.length > 1 ? ` · ${sets.length - 1} more on the workout page` : '';
  const rule = byRule.length ? ruleText(r) : undefined;
  return { text: `${first.name} ${first.text}`, detail: `${first.reason}${more}`, ...(first.delta ? { delta: first.delta } : {}), ...(rule ? { rule } : {}), sets };
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
export const nextTime = (r: Runsheet, done: SessionResult, history: SessionResult[], intent: Intent = 'maintain', covered: string[] = [], kit?: Equipment, suggest?: SuggestPrefs): NextTimeLine[] => {
  if (!suggestOn(suggest, r)) return [];
  const all = [...history.filter(h => h !== done && (h.id === undefined || h.id !== done.id)), { ...done, runsheetId: done.runsheetId || id(r) }];
  const out: NextTimeLine[] = [];
  const score = scoreTarget(r, all, intent);
  if (score) out.push({ key: 'score', name: r.title, text: score.text, reason: score.detail });
  if (!score) for (const s of setTargets(r, all, intent, kit, suggest)) if (!covered.includes(s.exerciseKey)) out.push({ key: s.exerciseKey, name: s.name, text: s.text, reason: s.reason });
  return out;
};
