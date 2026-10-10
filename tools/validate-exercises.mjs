// Validates imports/exercise-details.json against the exercise catalogue (src/features/exercises/
// library.ts plus every imports/*/new-exercises.json): schema, one entry per catalogue key, unique
// keys, and every regression/progression/sameAs link resolving to a catalogue key. Exit 1 on any
// error. Run: node tools/validate-exercises.mjs [details.json]  (a partial file skips coverage).
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.join(here, '..');
const detailsPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'imports/exercise-details.json');
const partial = Boolean(process.argv[2]);

export const PATTERNS = ['squat', 'hinge', 'lunge', 'push_horizontal', 'push_vertical', 'pull_horizontal', 'pull_vertical', 'carry', 'core', 'rotation', 'olympic', 'plyometric', 'locomotion', 'conditioning', 'isolation', 'mobility', 'stretch', 'balance', 'combo'];
export const EQUIPMENT = ['none', 'mat', 'barbell', 'plates', 'rack', 'bench', 'dumbbell', 'kettlebell', 'cable', 'machine', 'band', 'pullup_bar', 'rings', 'dip_bars', 'parallettes', 'box', 'step', 'wall', 'chair', 'medicine_ball', 'wall_ball', 'slam_ball', 'sandbag', 'sled', 'climbing_rope', 'battle_rope', 'jump_rope', 'rower', 'ski_erg', 'bike', 'air_bike', 'treadmill', 'stair_climber', 'cross_trainer', 'pool', 'ghd', 'landmine', 'trap_bar', 'ab_wheel', 'weight_vest', 'water_cans', 'partner', 'track'];
export const MUSCLES = ['chest', 'lats', 'upper_back', 'traps', 'lower_back', 'front_delts', 'side_delts', 'rear_delts', 'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'glutes', 'abductors', 'adductors', 'hip_flexors', 'quads', 'hamstrings', 'calves', 'neck', 'cardio'];
/** Fine muscles → the body map's regions (src/features/results/muscles.ts). */
export const BODY_MAP = { chest: 'chest', lats: 'back', upper_back: 'back', traps: 'back', lower_back: 'back', front_delts: 'shoulders', side_delts: 'shoulders', rear_delts: 'shoulders', biceps: 'arms', triceps: 'arms', forearms: 'arms', abs: 'core', obliques: 'core', glutes: 'glutes', abductors: 'glutes', adductors: 'quads', hip_flexors: 'core', quads: 'quads', hamstrings: 'hamstrings', calves: 'calves', neck: null, cardio: null };
const DIFFICULTY = ['Easy', 'Medium', 'Hard'];
const FOR_MODES = ['reps', 'seconds', 'meters', 'minutes', 'calories'];
const FIELDS = new Set(['key', 'pattern', 'equipment', 'primary', 'secondary', 'difficulty', 'cues', 'mistakes', 'regressions', 'progressions', 'defaults', 'perSide', 'sameAs']);

// The catalogue, read the same way validate-imports.mjs and export-ios.mjs read it.
const libSrc = fs.readFileSync(path.join(root, 'src/features/exercises/library.ts'), 'utf8');
const catalogue = new Map([...libSrc.matchAll(/^\s{2}"([a-z0-9_]+)": (\{.*\}),$/gm)].map(m => [m[1], JSON.parse(m[2])]));
for (const d of fs.readdirSync(path.join(root, 'imports'))) {
  const f = path.join(root, 'imports', d, 'new-exercises.json');
  if (fs.existsSync(f)) for (const e of JSON.parse(fs.readFileSync(f, 'utf8'))) if (!catalogue.has(e.key)) catalogue.set(e.key, e);
}

const details = JSON.parse(fs.readFileSync(detailsPath, 'utf8'));
const list = Array.isArray(details) ? details : details.exercises;
let errors = 0;
const err = (k, m) => (console.error(`${k}: ${m}`), errors++);
const isStrArr = (v, min, max, maxLen) => Array.isArray(v) && v.length >= min && v.length <= max && v.every(s => typeof s === 'string' && s.trim() && s.length <= maxLen && !/\.$/.test(s));
const inVocab = (v, vocab, min, max) => Array.isArray(v) && v.length >= min && v.length <= max && new Set(v).size === v.length && v.every(x => vocab.includes(x));

const seen = new Set();
for (const e of list) {
  const k = e.key;
  if (typeof k !== 'string') { err('?', 'missing key'); continue; }
  if (seen.has(k)) err(k, 'duplicate key');
  seen.add(k);
  if (!catalogue.has(k)) err(k, 'not in the catalogue');
  for (const f of Object.keys(e)) if (!FIELDS.has(f)) err(k, `unknown field ${f}`);
  if (!PATTERNS.includes(e.pattern)) err(k, `bad pattern ${e.pattern}`);
  if (!inVocab(e.equipment, EQUIPMENT, 1, 6)) err(k, `bad equipment ${JSON.stringify(e.equipment)}`);
  else if (e.equipment.includes('none') && e.equipment.length > 1) err(k, '"none" mixed with other equipment');
  if (!inVocab(e.primary, MUSCLES, 1, 3)) err(k, `bad primary ${JSON.stringify(e.primary)}`);
  if (!inVocab(e.secondary, MUSCLES, 0, 4)) err(k, `bad secondary ${JSON.stringify(e.secondary)}`);
  else if (e.secondary.some(m => e.primary?.includes(m))) err(k, 'muscle in both primary and secondary');
  if (!DIFFICULTY.includes(e.difficulty)) err(k, `bad difficulty ${e.difficulty}`);
  if (!isStrArr(e.cues, 3, 5, 90)) err(k, 'cues: 3-5 strings, <=90 chars, no trailing full stop');
  if (!isStrArr(e.mistakes, 1, 3, 80)) err(k, 'mistakes: 1-3 strings, <=80 chars, no trailing full stop');
  for (const rel of ['regressions', 'progressions']) {
    if (!Array.isArray(e[rel]) || e[rel].length > 3 || new Set(e[rel]).size !== e[rel].length) { err(k, `${rel}: array of 0-3 unique keys`); continue; }
    for (const t of e[rel]) {
      if (t === k) err(k, `${rel} links to itself`);
      else if (!catalogue.has(t)) err(k, `${rel} → unknown key ${t}`);
    }
  }
  if (Array.isArray(e.regressions) && Array.isArray(e.progressions) && e.regressions.some(t => e.progressions.includes(t))) err(k, 'same key is a regression and a progression');
  if (e.sameAs !== undefined && (e.sameAs === k || !catalogue.has(e.sameAs))) err(k, `sameAs → bad key ${e.sameAs}`);
  const d = e.defaults;
  if (!d || typeof d !== 'object') err(k, 'missing defaults');
  else {
    if (!(Number.isInteger(d.sets) && d.sets >= 1 && d.sets <= 6)) err(k, `defaults.sets ${d.sets}`);
    if (!FOR_MODES.includes(d.forMode)) err(k, `defaults.forMode ${d.forMode}`);
    if (!(Number.isInteger(d.min) && Number.isInteger(d.max) && d.min > 0 && d.min <= d.max)) err(k, `defaults.min/max ${d.min}/${d.max}`);
    if (!(Number.isInteger(d.restSec) && d.restSec >= 0 && d.restSec <= 300 && d.restSec % 15 === 0)) err(k, `defaults.restSec ${d.restSec}`);
    const extra = Object.keys(d).filter(f => !['sets', 'forMode', 'min', 'max', 'restSec'].includes(f));
    if (extra.length) err(k, `defaults: unknown ${extra.join(', ')}`);
  }
  if (typeof e.perSide !== 'boolean') err(k, 'perSide must be boolean');
}

if (!partial) {
  const missing = [...catalogue.keys()].filter(k => !seen.has(k));
  if (missing.length) err('coverage', `${missing.length} catalogue key(s) without details: ${missing.join(' ')}`);
}

// Warnings: links that point back the wrong way (A regresses to B while B also regresses to A).
const byKey = new Map(list.map(e => [e.key, e]));
let warnings = 0;
for (const e of list) for (const t of e.regressions ?? []) if (byKey.get(t)?.regressions?.includes(e.key)) (console.warn(`warn: ${e.key} and ${t} list each other as regressions`), warnings++);
for (const e of list) for (const t of e.progressions ?? []) if (byKey.get(t)?.progressions?.includes(e.key)) (console.warn(`warn: ${e.key} and ${t} list each other as progressions`), warnings++);

const count = (f) => list.reduce((m, e) => ((m[f(e)] = (m[f(e)] || 0) + 1), m), {});
console.log(`${list.length} exercises with details (catalogue ${catalogue.size}), ${warnings} warning(s)`);
console.log('difficulty', JSON.stringify(count(e => e.difficulty)));
console.log('pattern', JSON.stringify(count(e => e.pattern)));
console.log(`linked: ${list.filter(e => e.regressions?.length).length} with regressions, ${list.filter(e => e.progressions?.length).length} with progressions`);
console.log(errors ? `\n${errors} error(s)` : '\nall valid');
process.exit(errors ? 1 : 0);
