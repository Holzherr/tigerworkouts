/**
 * Rough text in, structured edits out. Two jobs:
 *  - parsePlan(text, library): whole plans in shorthand ("kb swings 28 + incline press 20 x8 30/30")
 *  - applyCommands(runsheet, text, library): one-line changes ("press 20, half rests, skip walk")
 * Rule-based and on-device. Anything it cannot read comes back in `unparsed` for the user to fix.
 */
import type { ExerciseRef } from './model';
import { makeExercise, makeRest, type Block, type ExerciseStep, type Item, type RestStep, type Runsheet, type Step, uid } from './model';

export interface ParseResult {
  items: Item[];
  unparsed: string[];
  /** Things guessed rather than read, for amber flags. */
  assumptions: string[];
}

const ALIASES: Record<string, string> = { kb: 'kettlebell', db: 'dumbbell', bb: 'barbell', 'lat raises': 'lateral raises', 'lat raise': 'lateral raises', swings: 'kettlebell swings', swing: 'kettlebell swings', press: 'incline chest press', 'shoulder press': 'shoulder press', 'chest press': 'incline chest press', sprints: 'treadmill sprints', sprint: 'treadmill sprints', walk: 'incline walk', run: 'run', 'push ups': 'push-up', pushups: 'push-up', 'pull ups': 'pull-up', pullups: 'pull-up', squats: 'bodyweight squat', 'air squats': 'bodyweight squat', burpees: 'burpee', plank: 'plank', row: 'rowing machine', rowing: 'rowing machine', bike: 'stationary bike', thrusters: 'barbell thruster', thruster: 'barbell thruster', 'wall balls': 'wall ball', 'du': 'double-under', 'double unders': 'double-under' };

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9+/×x.\-\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Best library match for a free-text name: alias, exact, then word overlap. */
export const matchExercise = (name: string, lib: Record<string, ExerciseRef>): { ref: ExerciseRef; exact: boolean } | null => {
  const n = norm(name);
  if (!n) return null;
  const expanded = Object.entries(ALIASES).reduce((acc, [k, v]) => (acc === k || acc.startsWith(k + ' ') || acc.endsWith(' ' + k) ? acc.replace(k, v) : acc), n);
  const list = Object.values(lib);
  const exact = list.find(e => norm(e.name) === expanded || norm(e.name) === n);
  if (exact) return { ref: exact, exact: true };
  const words = expanded.split(' ').filter(w => w.length > 2);
  let best: { ref: ExerciseRef; score: number } | null = null;
  for (const e of list) {
    const en = norm(e.name);
    const ew = en.split(' ');
    const hit = words.filter(w => ew.some(x => x.startsWith(w) || w.startsWith(x))).length;
    const score = hit / Math.max(words.length, 1) - Math.abs(ew.length - words.length) * 0.05;
    if (hit && (!best || score > best.score)) best = { ref: e, score };
  }
  return best && best.score >= 0.45 ? { ref: best.ref, exact: false } : null;
};

const numRe = /(\d+(?:\.\d+)?)/;

/** One line = one block (or one loose step). "a 28 + b 20 x8 30/30", "sprints 14.5 x8, rest 15", "incline walk 10 min inc 6", "skip the walk". */
export const parsePlan = (text: string, lib: Record<string, ExerciseRef>): ParseResult => {
  const items: Item[] = [];
  const unparsed: string[] = [];
  const assumptions: string[] = [];
  for (const raw of text.split(/\n|;/).map(l => l.trim()).filter(Boolean)) {
    const line = norm(raw);
    if (/^(skip|drop|no)\b/.test(line)) {
      unparsed.push(raw);
      continue;
    }
    // block-level numbers
    const rounds = line.match(/(?:x|×)\s*(\d+)\b/) ?? line.match(/(\d+)\s*rounds?/);
    const onOff = line.match(/(\d+)\s*\/\s*(\d+)/);
    const restM = line.match(/rest\s*(\d+)/);
    const halfRest = /half rests?/.test(line);
    const minutes = line.match(/(\d+)\s*min/);
    const incline = line.match(/(?:inc|incline)\s*(\d+)/);
    const amrap = line.match(/amrap\s*(\d+)/);
    const emom = line.match(/emom\s*(\d+)/);
    let body = line.replace(/(?:x|×)\s*\d+\b/, '').replace(/\d+\s*\/\s*\d+/, '').replace(/rest\s*\d+/, '').replace(/half rests?/, '').replace(/\d+\s*rounds?/, '').replace(/(?:inc|incline)\s*\d+/, '').replace(/amrap\s*\d+|emom\s*\d+/, '').trim();
    const parts = body.split(/\s*\+\s*|,\s*/).map(p => p.trim()).filter(Boolean);
    const steps: Step[] = [];
    let bad = false;
    for (const p of parts) {
      const m = p.match(numRe);
      const nameTxt = m ? p.slice(0, m.index).trim() || p.replace(numRe, '').trim() : p;
      const value = m ? parseFloat(m[1]) : undefined;
      const hit = matchExercise(nameTxt.replace(/\bkg\b|\bkph\b|\bmin\b/g, '').trim(), lib);
      if (!hit) {
        bad = true;
        continue;
      }
      if (!hit.exact) assumptions.push(`"${nameTxt}" → ${hit.ref.name}`);
      const isCardioMinutes = minutes && parts.length === 1 && !onOff;
      const step: ExerciseStep = makeExercise(hit.ref, {
        target: hit.ref.unit ? (value ?? undefined) : undefined,
        forMode: isCardioMinutes ? 'minutes' : onOff ? 'seconds' : /\breps?\b/.test(p) ? 'reps' : hit.ref.unit && value !== undefined ? 'seconds' : 'reps',
        forValue: isCardioMinutes ? parseInt(minutes[1], 10) : onOff ? parseInt(onOff[1], 10) : /\breps?\b/.test(p) ? (value ?? 10) : hit.ref.unit && value !== undefined ? 30 : (value ?? 10),
        incline: incline ? parseInt(incline[1], 10) : undefined,
      });
      steps.push(step);
      const restSec = restM ? parseInt(restM[1], 10) : onOff ? parseInt(onOff[2], 10) : undefined;
      if (restSec !== undefined && (onOff || restM)) steps.push(makeRest(halfRest ? Math.round(restSec / 2) : restSec));
    }
    if (!steps.length || bad) {
      unparsed.push(raw);
      if (!steps.length) continue;
    }
    const oneLoose = steps.length === 1 && !rounds && !amrap && !emom;
    if (oneLoose) {
      items.push(steps[0]);
      continue;
    }
    if (!onOff && !restM && steps.every(s => s.kind === 'exercise') && (rounds || amrap)) assumptions.push(`${raw}: no rest given, none added`);
    const block: Block = { kind: 'block', id: uid('b'), name: steps.filter((s): s is ExerciseStep => s.kind === 'exercise').map(s => s.exercise.name).join(' + '), repeat: rounds ? parseInt(rounds[1], 10) : emom ? parseInt(emom[1], 10) : 1, steps, mode: amrap ? 'amrap' : emom ? 'emom' : undefined, timeCapSec: amrap ? parseInt(amrap[1], 10) * 60 : undefined, everySec: emom ? 60 : undefined };
    if (!rounds && !amrap && !emom) assumptions.push(`${raw}: assumed 1 round`);
    items.push(block);
  }
  return { items, unparsed, assumptions };
};

/** Apply one-line edits to an existing runsheet. Returns the new runsheet and what was not understood. */
export const applyCommands = (r: Runsheet, text: string, lib: Record<string, ExerciseRef>): { runsheet: Runsheet; applied: string[]; unparsed: string[] } => {
  const applied: string[] = [];
  const unparsed: string[] = [];
  let items = r.items;
  const eachStep = (fn: (s: Step) => Step) => (items = items.map(it => (it.kind === 'block' ? { ...it, steps: it.steps.map(fn) } : it.kind === 'ref' ? it : fn(it))));
  for (const raw of text.split(/,|;|\n/).map(x => x.trim()).filter(Boolean)) {
    const c = norm(raw);
    if (/^(half|halve) rests?$/.test(c)) {
      eachStep(s => (s.kind === 'rest' ? { ...s, seconds: Math.max(5, Math.round(s.seconds / 2)) } : s));
      applied.push('halved every rest');
      continue;
    }
    if (/^(double|twice) rests?$/.test(c)) {
      eachStep(s => (s.kind === 'rest' ? { ...s, seconds: s.seconds * 2 } : s));
      applied.push('doubled every rest');
      continue;
    }
    const rest = c.match(/^rests?\s*(\d+)/);
    if (rest) {
      eachStep(s => (s.kind === 'rest' ? { ...s, seconds: parseInt(rest[1], 10) } : s));
      applied.push(`rests ${rest[1]}s`);
      continue;
    }
    const skip = c.match(/^(?:skip|drop|remove|no)\s+(?:the\s+)?(.+)$/);
    if (skip) {
      const hit = matchExercise(skip[1], lib);
      if (hit) {
        const key = hit.ref.key;
        items = items.flatMap<Item>(it => {
          if (it.kind === 'block') {
            const steps = it.steps.filter(s => !(s.kind === 'exercise' && s.exercise.key === key));
            if (steps.every(s => s.kind === 'rest')) return [];
            return [{ ...it, steps }];
          }
          return it.kind === 'exercise' && it.exercise.key === key ? [] : [it];
        });
        applied.push(`dropped ${hit.ref.name}`);
        continue;
      }
    }
    const rounds = c.match(/^(\d+)\s*rounds?$/) ?? c.match(/^(?:x|×)\s*(\d+)$/);
    if (rounds) {
      items = items.map(it => (it.kind === 'block' && (it.mode ?? 'rounds') !== 'amrap' ? { ...it, repeat: parseInt(rounds[1], 10) } : it));
      applied.push(`${rounds[1]} rounds`);
      continue;
    }
    // "<exercise> <number>" → set the load
    const m = c.match(/^(.*?)\s*(\d+(?:\.\d+)?)\s*(kg|kph|reps?)?$/);
    if (m) {
      const hit = matchExercise(m[1], lib);
      if (hit) {
        const v = parseFloat(m[2]);
        const asReps = m[3]?.startsWith('rep');
        eachStep(s => (s.kind === 'exercise' && s.exercise.key === hit.ref.key ? (asReps ? { ...s, forMode: 'reps', forValue: v } : { ...s, target: v }) : s));
        applied.push(`${hit.ref.name} ${asReps ? `${v} reps` : `${v} ${hit.ref.unit}`}`);
        continue;
      }
    }
    unparsed.push(raw);
  }
  return { runsheet: { ...r, items }, applied, unparsed };
};

export type { RestStep };
