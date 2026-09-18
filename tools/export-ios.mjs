/**
 * Exports the workout library the web app builds at compile time into two JSON files the iOS app
 * bundles. One source of truth: edit imports/ and re-run, never hand-edit the exported JSON.
 *
 *   node tools/export-ios.mjs
 *
 * `exercise` is always a key string in the export, and every key it uses exists in exercises.json —
 * including the ones an import declared inline — so the Swift decoder never has to handle a miss.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'ios/TigerWorkouts/Resources');
const tmp = join(root, 'node_modules/.cache/export-ios');

// library.ts is a generated file of plain object literals with a type-only import, so esbuild can
// hand it to node as-is rather than us re-parsing TypeScript.
mkdirSync(tmp, { recursive: true });
execFileSync(join(root, 'node_modules/.bin/esbuild'), [join(root, 'src/features/exercises/library.ts'), '--format=esm', '--log-level=warning', `--outfile=${join(tmp, 'library.mjs')}`]);
const { LIBRARY, GROUP_LABEL } = await import(pathToFileURL(join(tmp, 'library.mjs')).href);

const GROUP_ICON = { barbell: '🏋️', dumbbell: '🏋️', kettlebell: '🏋️', body: '🤸', core: '🧘', band: '🪢', treadmill: '🏃', walk: '🚶', run: '🏃', bike: '🚴', rower: '🚣', swim: '🏊', gym: '🪜' };

const extra = {};
const raw = [];
const importsDir = join(root, 'imports');
for (const source of readdirSync(importsDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)) {
  for (const file of readdirSync(join(importsDir, source)).filter(f => f.endsWith('.json'))) {
    const data = JSON.parse(readFileSync(join(importsDir, source, file), 'utf8'));
    if (file === 'new-exercises.json') for (const e of data) extra[e.key] = { icon: GROUP_ICON[e.group] ?? '🏋️', ...e };
    else raw.push({ source, data });
  }
}

const library = { ...extra, ...LIBRARY };
/** Resolve a step's exercise to a key, registering inline refs and unknown keys so nothing dangles. */
const keyOf = x => {
  if (typeof x !== 'string') {
    library[x.key] ??= { group: 'body', cue: '', ...x };
    return x.key;
  }
  library[x] ??= { key: x, name: x.replace(/^[a-z]+_/, '').replace(/_/g, ' '), unit: '', step: 1, group: 'body', cue: '' };
  return x;
};
const step = (s, id) => (s.kind === 'rest' ? { ...s, id: s.id || id } : { ...s, id: s.id || id, exercise: keyOf(s.exercise) });
const item = (it, i) => (it.kind === 'block' ? { ...it, id: it.id || `b${i}`, steps: it.steps.map((s, j) => step(s, `s${i}-${j}`)) } : step(it, `s${i}`));

const workouts = raw
  .map(({ source, data }) => ({ source, runsheet: { ...data, items: data.items.map(item) } }))
  .sort((a, b) => a.source.localeCompare(b.source) || (a.runsheet.program?.order ?? 0) - (b.runsheet.program?.order ?? 0) || a.runsheet.title.localeCompare(b.runsheet.title));

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'exercises.json'), JSON.stringify({ groups: GROUP_LABEL, exercises: Object.values(library).sort((a, b) => a.key.localeCompare(b.key)) }));
writeFileSync(join(out, 'workouts.json'), JSON.stringify(workouts));
rmSync(tmp, { recursive: true, force: true });
console.log(`${workouts.length} workouts, ${Object.keys(library).length} exercises → ios/TigerWorkouts/Resources`);
