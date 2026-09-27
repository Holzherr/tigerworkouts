/**
 * What to do instead: exercises that train the same movement with different kit, and a load
 * converted into the new exercise's own terms (a dumbbell press is written per arm, a machine is
 * not). Ported from `ios/TigerWorkouts/Model/Alternatives.swift`, which the timer's swap uses; the
 * web app reads it for the stall options.
 */
import { GROUP_LABEL, type LibraryExercise } from './library';

export type Pattern = 'horizontalPress' | 'verticalPress' | 'horizontalPull' | 'verticalPull' | 'squat' | 'hinge' | 'lunge' | 'carry' | 'core' | 'cardio';

export const PATTERN_LABEL: Record<Pattern, string> = {
  horizontalPress: 'pressing away from the chest',
  verticalPress: 'pressing overhead',
  horizontalPull: 'rowing',
  verticalPull: 'pulling down',
  squat: 'squatting',
  hinge: 'hinging at the hip',
  lunge: 'single-leg work',
  carry: 'carrying',
  core: 'trunk work',
  cardio: 'cardio',
};

/** Ordered: the first match wins, so `leg_press` is a squat before `press` catches it. */
const RULES: [Pattern, string[]][] = [
  ['verticalPull', ['pulldown', 'pull_up', 'pullup', 'chin_up', 'muscle_up', 'lat_pull']],
  ['horizontalPull', ['row', 'face_pull', 'rear_delt']],
  ['squat', ['squat', 'leg_press', 'leg_ext', 'wall_sit', 'thruster']],
  ['lunge', ['lunge', 'split', 'step_up', 'bulgarian', 'pistol']],
  ['hinge', ['deadlift', 'swing', 'rdl', 'good_morning', 'hip_thrust', 'hip_bridge', 'back_raise', 'clean', 'snatch', 'kb_']],
  ['verticalPress', ['shoulder_press', 'overhead_press', 'push_press', 'ohp', 'handstand', 'jerk', 'landmine_press']],
  ['horizontalPress', ['bench', 'chest_press', 'chest_fly', 'pushup', 'push_up', 'floor_press', 'dip']],
  ['carry', ['carry', 'march', 'drag']],
  ['core', ['plank', 'crunch', 'sit_up', 'situp', 'hollow', 'dead_bug', 'deadbug', 'russian_twist', 'leg_raise', 'mountain_climber']],
  ['cardio', ['cardio_', 'sprint', 'incline_walk', 'run', 'row', 'bike', 'ski']],
];

export const patternOf = (e: LibraryExercise): Pattern | undefined => {
  const hay = `${e.key.toLowerCase()} ${e.name.toLowerCase().replaceAll(' ', '_')}`;
  // Cardio machines first: `cardio_rower` is a rower, not a row.
  if (['rower', 'run', 'bike', 'walk', 'treadmill', 'swim'].includes(e.group)) return 'cardio';
  return RULES.find(([, needles]) => needles.some(n => hay.includes(n)))?.[0];
};

type LoadKind = 'perArm' | 'total' | 'none';
const loadKind = (e: LibraryExercise): LoadKind => {
  const unit = e.unit.toLowerCase();
  if (unit.includes('per arm') || unit.includes('per side')) return 'perArm';
  return unit === 'kg' ? 'total' : 'none';
};

/** Two dumbbells make roughly one machine's number, and a machine's leverage flatters it by about a
 * tenth. Guidance, not physics. Rounded to what the new exercise's steppers move by. */
export const convertLoad = (target: number | undefined, from: LibraryExercise, to: LibraryExercise): number | undefined => {
  if (target === undefined || target <= 0) return undefined;
  const [a, b] = [loadKind(from), loadKind(to)];
  if (a === 'none' || b === 'none') return undefined;
  const raw = a === 'perArm' && b === 'total' ? target * 2 * 1.1 : a === 'total' && b === 'perArm' ? target / 2 / 1.1 : target;
  const step = to.step > 0 ? to.step : 1;
  return Math.round(raw / step) * step;
};

export interface Alternative {
  exercise: LibraryExercise;
  target?: number;
  /** The group label: "Barbell & machines". */
  why: string;
}

/** Same pattern, never the same exercise, a different kit group first, then by name. */
export const alternatives = (key: string, target: number | undefined, library: Record<string, LibraryExercise>, limit = 5): Alternative[] => {
  const ex = library[key];
  const wanted = ex && patternOf(ex);
  if (!ex || !wanted) return [];
  return Object.values(library)
    .filter(e => e.key !== ex.key && patternOf(e) === wanted)
    .sort((a, b) => (a.group === ex.group) !== (b.group === ex.group) ? (a.group === ex.group ? 1 : -1) : a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    .slice(0, limit)
    .map(e => ({ exercise: e, target: convertLoad(target, ex, e), why: GROUP_LABEL[e.group] ?? e.group }));
};
