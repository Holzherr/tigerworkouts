// Regenerates src/features/exercises/library.ts from the v0.9 app's data.js so both apps share
// one exercise list until the Supabase-backed library is ported. Run: node tools/port-library.mjs
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const src = fs.readFileSync(path.join(here, '../../workout-hub/data.js'), 'utf8');
const w = {};
new Function('window', src + ';window.EXERCISES=EXERCISES')(w);
const ex = w.EXERCISES;
const keys = Object.keys(ex);
const GROUP = { barbell: 'Barbell & machines', dumbbell: 'Dumbbell', kettlebell: 'Kettlebell', body: 'Bodyweight', core: 'Core', band: 'Cable & band', treadmill: 'Treadmill', walk: 'Walking & stairs', run: 'Running', bike: 'Bike', rower: 'Rower & ski', swim: 'Swim', racket: 'Sport', gym: 'Gym rig & odd objects' };
const groups = [...new Set([...keys.map(k => ex[k].icon), 'gym'])]; // gym = rig, rings, wall ball, sled, rope (imports)

let out = `// Generated from ../../../../workout-hub/data.js by tools/port-library.mjs. Edit there, then re-run.
import type { ExerciseRef } from '@/features/runsheet/model';

export type ExerciseGroup = ${groups.map(g => JSON.stringify(g)).join(' | ')};

export interface LibraryExercise extends ExerciseRef {
  group: ExerciseGroup;
  cue: string;
}

export const GROUP_LABEL: Record<ExerciseGroup, string> = ${JSON.stringify(Object.fromEntries(groups.map(g => [g, GROUP[g] || 'Other'])), null, 2)};

export const LIBRARY: Record<string, LibraryExercise> = {
`;
for (const k of keys) {
  const e = ex[k];
  const o = { key: k, name: e.name, unit: e.unit === 'reps' || e.unit === 'bodyweight' ? '' : e.unit || '', step: e.step || 1, group: e.icon, cue: e.cue || '' };
  if (e.clip) o.clip = e.clip;
  if (e.poster) o.poster = e.poster;
  out += `  ${JSON.stringify(k)}: ${JSON.stringify(o)},\n`;
}
out += `};

export const exerciseRef = (key: string): ExerciseRef => LIBRARY[key] ?? { key, name: key, unit: 'kg', step: 2.5 };
`;
fs.writeFileSync(path.join(here, '../src/features/exercises/library.ts'), out);
console.log(keys.length, 'exercises ported');
