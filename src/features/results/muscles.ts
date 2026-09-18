import type { ExerciseGroup } from '@/features/exercises/library';

export type Muscle = 'chest' | 'back' | 'shoulders' | 'arms' | 'core' | 'glutes' | 'quads' | 'hamstrings' | 'calves';

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  arms: 'Arms',
  core: 'Core',
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
};

/** 1 = the exercise is mainly this, 0.5 = it is along for the ride. */
type Share = Partial<Record<Muscle, number>>;

/**
 * Name first, equipment second. Keyed on the words that actually appear in exercise names, most
 * specific first, so "incline chest press" is chest and "lateral raise" is shoulders rather than
 * either falling to the generic press or row rule. Anything unmatched falls back to what the
 * equipment group makes likely — a rough shape beats a blank body.
 */
/** Exercise names are written plural as often as singular, so every term matches both. */
const words = (...terms: string[]) => new RegExp(`\\b(?:${terms.join('|')})(?:e?s)?\\b`, 'i');

const BY_NAME: [RegExp, Share][] = [
  [words('swing', 'hinge'), { glutes: 1, hamstrings: 1, back: 0.5, core: 0.5 }],
  [words('deadlift', 'good ?morning', 'rdl'), { hamstrings: 1, glutes: 1, back: 1, core: 0.5 }],
  [words('squat', 'lunge', 'step[- ]?up', 'leg press', 'wall sit'), { quads: 1, glutes: 1, core: 0.5 }],
  [words('hip thrust', 'glute bridge'), { glutes: 1, hamstrings: 0.5 }],
  [words('calf', 'calve', 'heel raise'), { calves: 1 }],
  [words('leg curl', 'hamstring curl', 'nordic'), { hamstrings: 1 }],
  [words('lateral raise', 'front raise', 'rear delt', 'face pull', 'upright row'), { shoulders: 1, back: 0.5 }],
  [words('shoulder press', 'overhead press', 'ohp', 'push press', 'handstand'), { shoulders: 1, arms: 0.5, core: 0.5 }],
  [words('chest press', 'bench', 'fly', 'flye', 'push[- ]?up', 'press[- ]?up', 'dip'), { chest: 1, arms: 0.5, shoulders: 0.5 }],
  [words('row', 'pull[- ]?up', 'chin[- ]?up', 'pulldown', 'pullover', 'lat raise'), { back: 1, arms: 0.5 }],
  [words('tricep', 'skull ?crusher', 'kickback', 'pushdown'), { arms: 1 }],
  [words('curl'), { arms: 1 }],
  [words('plank', 'crunch', 'sit[- ]?up', 'hollow', 'russian twist', 'leg raise', 'dead ?bug', 'v[- ]?up', 'mountain climber'), { core: 1 }],
  [words('burpee', 'thruster', 'clean', 'snatch', 'jerk', 'wall ball', 'man ?maker'), { quads: 1, shoulders: 1, back: 0.5, core: 0.5, glutes: 0.5 }],
  [words('sprint', 'run', 'jog', 'treadmill'), { quads: 1, hamstrings: 1, calves: 1, glutes: 0.5 }],
  [words('walk', 'stair', 'step ?mill'), { glutes: 1, calves: 1, quads: 0.5, hamstrings: 0.5 }],
  [words('rower', 'row erg', 'ski ?erg'), { back: 1, quads: 1, arms: 0.5, core: 0.5 }],
  [words('bike', 'cycle', 'assault', 'echo'), { quads: 1, calves: 0.5, glutes: 0.5 }],
  [words('swim'), { back: 1, shoulders: 1, core: 0.5 }],
  [words('jump rope', 'skip', 'box jump', 'jumping jack'), { calves: 1, quads: 0.5 }],
  [words('carry', 'farmer'), { core: 1, back: 0.5, arms: 0.5 }],
];

const BY_GROUP: Partial<Record<ExerciseGroup, Share>> = {
  treadmill: { quads: 1, hamstrings: 1, calves: 1 },
  run: { quads: 1, hamstrings: 1, calves: 1 },
  walk: { glutes: 1, calves: 1 },
  bike: { quads: 1, calves: 0.5 },
  rower: { back: 1, quads: 1 },
  swim: { back: 1, shoulders: 1 },
  core: { core: 1 },
  kettlebell: { glutes: 1, back: 0.5, core: 0.5 },
  band: { back: 0.5, arms: 0.5, shoulders: 0.5 },
};

/** Which muscles one exercise works, and how much. Empty when nothing is recognised. */
export const musclesFor = (name: string, group?: ExerciseGroup): Share => {
  for (const [re, share] of BY_NAME) if (re.test(name)) return share;
  return (group && BY_GROUP[group]) ?? {};
};

/**
 * The share of a session's working time each muscle took, normalised so the hardest-worked
 * muscle is 1. That is what shades the body map — relative emphasis, not an absolute claim.
 */
export const muscleLoad = (worked: { name: string; group?: ExerciseGroup; seconds: number }[]): Partial<Record<Muscle, number>> => {
  const total: Partial<Record<Muscle, number>> = {};
  for (const w of worked) {
    for (const [m, share] of Object.entries(musclesFor(w.name, w.group)) as [Muscle, number][]) {
      total[m] = (total[m] ?? 0) + share * w.seconds;
    }
  }
  const peak = Math.max(0, ...Object.values(total));
  if (!peak) return {};
  for (const k of Object.keys(total) as Muscle[]) total[k] = total[k]! / peak;
  return total;
};
