/**
 * The runsheet an agent writes, checked against the app's own model (src/features/runsheet/model.ts).
 * Every enum below is keyed by the model's type, so adding a mode to the app without adding it here
 * fails the type-check; `normalise` returns a value typed as the model's Runsheet.
 */
import { z } from 'zod';
import type { Block, BlockMode, ExerciseRef, ExerciseStep, ForMode, Item, ItemRole, RestStep, Runsheet, ScoreType, Step } from '@/features/runsheet/model';
import { runsheetMinutes, uid } from '@/features/runsheet/model';

const FOR_MODE: Record<ForMode, string> = {
  reps: 'forValue reps',
  seconds: 'forValue seconds of work (the timer counts down)',
  minutes: 'forValue minutes (steady cardio)',
  meters: 'forValue metres',
  calories: 'forValue calories (rower, bike)',
  max: 'as many reps / as long as possible; forValue ignored',
  amrap: 'at least forValue reps, then as many as possible ("5+")',
  segment: 'a stretch of a follow-along video, startSeconds to endSeconds',
};
const BLOCK_MODE: Record<BlockMode, string> = {
  rounds: 'repeat the steps `repeat` times',
  fortime: '`repeat` rounds as fast as possible, clock counts up, optional timeCapSec',
  amrap: 'as many rounds as possible in timeCapSec (required)',
  emom: 'start the steps every everySec seconds (default 60), `repeat` times',
  ladder: 'one pass per rung of `ladder` (e.g. [21,15,9]); rep steps take the rung as their reps',
};
const SCORE: Record<ScoreType, true> = { time: true, rounds: true, reps: true, load: true, distance: true, none: true };
const ROLE: Record<ItemRole, true> = { warmup: true, main: true, cooldown: true };

const keys = <K extends string>(r: Record<K, unknown>) => Object.keys(r) as [K, ...K[]];
const forMode = z.enum(keys(FOR_MODE));
const blockMode = z.enum(keys(BLOCK_MODE));
const score = z.enum(keys(SCORE));
const role = z.enum(keys(ROLE)).describe('warmup | main (default) | cooldown; the app draws dividers between parts');
const num = z.number().finite();
const pos = num.nonnegative();

const exerciseRef = z.object({
  key: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  unit: z.string().max(20).describe('Unit of `target`: "kg", "kg per arm", "kph", or "" for bodyweight'),
  step: num.positive().describe('Stepper increment for target, e.g. 2.5'),
  cue: z.string().max(200).optional(),
});

const progression = z.object({ onSuccessKg: pos.optional(), deloadPct: pos.max(100).optional(), failAfter: z.number().int().positive().optional(), amrapBumpAt: z.number().int().positive().optional(), tmBumpKg: pos.optional() });

export const exerciseStepInput = z.object({
  kind: z.literal('exercise'),
  id: z.string().max(60).optional(),
  exercise: z.union([z.string().min(1), exerciseRef]).describe('An exercise key from search_exercises (preferred), or a full {key,name,unit,step} for something not in the library'),
  forMode,
  forValue: pos.describe('Reps, seconds, minutes, metres or calories, per forMode'),
  forMax: pos.optional().describe('Upper bound of a range: 8–12 reps is forValue 8, forMax 12'),
  target: pos.optional().describe("Load or speed in the exercise's unit (kg, kg per arm, kph). Omit for bodyweight"),
  perSide: z.boolean().optional().describe('Reps/time are per side; the timer doubles it'),
  loadFactor: pos.optional().describe('Load as a multiple of bodyweight, instead of target'),
  targetPct: pos.max(200).optional().describe('Load as % of the training max, instead of target'),
  incline: pos.max(40).optional().describe('Treadmill incline %'),
  rx: z.object({ men: pos.optional(), women: pos.optional() }).optional(),
  startSeconds: pos.optional(),
  endSeconds: pos.optional(),
  ladderFactor: pos.optional(),
  ladderFixed: z.boolean().optional(),
  role: role.optional(),
  note: z.string().max(300).optional(),
});
export const restStepInput = z.object({ kind: z.literal('rest'), id: z.string().max(60).optional(), seconds: num.int().positive().max(3600), role: role.optional(), note: z.string().max(300).optional() });
const stepInput = z.discriminatedUnion('kind', [exerciseStepInput, restStepInput]);
export const blockInput = z.object({
  kind: z.literal('block'),
  id: z.string().max(60).optional(),
  name: z.string().max(80).optional().describe('Defaults to the exercise names joined with " + "'),
  repeat: num.int().positive().max(100).describe('Rounds; ignored for amrap'),
  mode: blockMode.optional().describe(Object.entries(BLOCK_MODE).map(([k, v]) => `${k}: ${v}`).join('; ')),
  timeCapSec: num.int().positive().optional(),
  everySec: num.int().positive().optional(),
  ladder: z.array(num.int().positive()).max(50).optional(),
  restBetweenSec: num.int().nonnegative().optional().describe('Rest between repeats of the block, not after the last'),
  score: score.optional(),
  progression: progression.optional(),
  role: role.optional(),
  note: z.string().max(300).optional(),
  steps: z.array(stepInput).min(1).max(40),
});
const itemInput = z.discriminatedUnion('kind', [exerciseStepInput, restStepInput, blockInput]);

export const runsheetInput = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional(),
  creator: z.string().max(80).optional().describe("Shown as the author; defaults to the user's name"),
  tags: z.array(z.string().max(30)).max(12).optional(),
  level: z.enum(['Easy', 'Medium', 'Hard']).optional(),
  timeCapSec: num.int().positive().optional().describe('One cap across the whole workout'),
  score: score.optional(),
  progression: progression.optional(),
  items: z.array(itemInput).min(1).max(60),
});
export type RunsheetInput = z.infer<typeof runsheetInput>;

export const FOR_MODE_HELP = Object.entries(FOR_MODE).map(([k, v]) => `${k} = ${v}`).join('; ');

export class RunsheetError extends Error {}

/**
 * Input → the model's Runsheet: exercise keys become full ExerciseRefs from `library`, missing ids
 * are filled, and the rules the timer relies on are checked. Throws RunsheetError with every
 * problem listed, so an agent can fix them all in one go.
 */
export const normalise = (input: RunsheetInput, library: (key: string) => ExerciseRef | undefined): Runsheet => {
  const problems: string[] = [];
  const seen = new Set<string>();
  const id = (given: string | undefined, prefix: string) => {
    let v = given && !seen.has(given) ? given : uid(prefix);
    while (seen.has(v)) v = uid(prefix);
    seen.add(v);
    return v;
  };
  const step = (s: z.infer<typeof stepInput>, where: string): Step => {
    if (s.kind === 'rest') return { ...s, id: id(s.id, 'r') } satisfies RestStep;
    let exercise: ExerciseRef | undefined;
    if (typeof s.exercise === 'string') {
      exercise = library(s.exercise);
      if (!exercise) problems.push(`${where}: unknown exercise key "${s.exercise}" — find one with search_exercises, or pass {key,name,unit,step}`);
    } else exercise = library(s.exercise.key) ?? s.exercise;
    if (s.forMode === 'segment' && s.startSeconds === undefined) problems.push(`${where}: forMode "segment" needs startSeconds`);
    if (s.forMax !== undefined && s.forMax < s.forValue) problems.push(`${where}: forMax (${s.forMax}) is below forValue (${s.forValue})`);
    if (s.target !== undefined && exercise && exercise.unit === '') problems.push(`${where}: "${exercise.name}" is bodyweight, so it takes no target`);
    const out: ExerciseStep = { ...s, id: id(s.id, 'e'), exercise: exercise ?? { key: String(s.exercise), name: String(s.exercise), unit: '', step: 1 } };
    return out;
  };
  const items: Item[] = input.items.map((it, i) => {
    const where = `items[${i}]`;
    if (it.kind !== 'block') return step(it, where);
    const mode = it.mode ?? 'rounds';
    if (mode === 'amrap' && !it.timeCapSec) problems.push(`${where}: an amrap block needs timeCapSec`);
    if (mode === 'ladder' && !it.ladder?.length) problems.push(`${where}: a ladder block needs ladder, e.g. [21,15,9]`);
    const steps = it.steps.map((s, j) => step(s, `${where}.steps[${j}]`));
    const names = [...new Set(steps.filter((s): s is ExerciseStep => s.kind === 'exercise').map(s => s.exercise.name))];
    const block: Block = { ...it, id: id(it.id, 'b'), name: it.name?.trim() || names.join(' + ') || 'Block', steps };
    return block;
  });
  if (problems.length) throw new RunsheetError(problems.join('\n'));
  const r: Runsheet = { ...input, items };
  if (runsheetMinutes(r) > 300) throw new RunsheetError(`That runs for about ${runsheetMinutes(r)} minutes; keep a workout under 5 hours`);
  return r;
};
