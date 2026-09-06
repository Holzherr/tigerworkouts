// Validates imports/**/**.json against the Runsheet shape and the exercise library, then prints a
// summary per source. Exit code 1 on any error. Run: node tools/validate-imports.mjs [--fix-ids]
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.join(here, '../imports');
const libSrc = fs.readFileSync(path.join(here, '../src/features/exercises/library.ts'), 'utf8');
const libKeys = new Set([...libSrc.matchAll(/^\s{2}"([a-z0-9_]+)":/gm)].map(m => m[1]));

const FOR = new Set(['seconds', 'reps', 'minutes', 'meters', 'calories', 'max', 'amrap', 'segment']);
const ROLES = new Set(['warmup', 'main', 'cooldown']);
const SCORES = new Set(['time', 'rounds', 'reps', 'load', 'distance', 'none']);
const MODES = new Set(['rounds', 'fortime', 'amrap', 'emom', 'ladder']);
const KINDS = new Set(['benchmark', 'program', 'video', 'article', 'protocol', 'user']);
const GROUPS = new Set(['barbell', 'dumbbell', 'kettlebell', 'body', 'core', 'band', 'treadmill', 'walk', 'run', 'bike', 'rower', 'swim', 'gym']);

const sources = fs.readdirSync(root).filter(d => fs.statSync(path.join(root, d)).isDirectory());
const newEx = new Map();
for (const s of sources) {
  const f = path.join(root, s, 'new-exercises.json');
  if (!fs.existsSync(f)) continue;
  for (const e of JSON.parse(fs.readFileSync(f, 'utf8'))) {
    if (newEx.has(e.key) && newEx.get(e.key).name !== e.name) console.warn(`warn: ${e.key} defined twice with different names (${newEx.get(e.key).src}, ${s})`);
    newEx.set(e.key, { ...e, src: s });
  }
}
const known = k => libKeys.has(k) || newEx.has(k);

let errors = 0;
const summary = [];
const unknown = new Map();
const modes = {};
const fors = {};
for (const s of sources) {
  const files = fs.readdirSync(path.join(root, s)).filter(f => f.endsWith('.json') && f !== 'new-exercises.json');
  let n = 0;
  const ids = new Set();
  for (const f of files) {
    const p = path.join(root, s, f);
    let w;
    try {
      w = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      console.error(`${s}/${f}: invalid JSON (${e.message})`);
      errors++;
      continue;
    }
    const err = m => (console.error(`${s}/${f}: ${m}`), errors++);
    if (!w.id || typeof w.id !== 'string') err('missing id');
    if (ids.has(w.id)) err(`duplicate id ${w.id}`);
    ids.add(w.id);
    if (!w.title) err('missing title');
    if (!w.source?.url && w.source?.kind !== 'user') err('missing source.url');
    if (w.source && !KINDS.has(w.source.kind)) err(`bad source.kind ${w.source.kind}`);
    if (!Array.isArray(w.items) || !w.items.length) err('no items');
    const checkStep = (st, where) => {
      if (st.kind === 'rest') {
        if (!(st.seconds > 0)) err(`${where}: rest without seconds`);
        return;
      }
      if (st.kind !== 'exercise') return err(`${where}: bad step kind ${st.kind}`);
      const key = typeof st.exercise === 'string' ? st.exercise : st.exercise?.key;
      if (!known(key)) {
        unknown.set(key, (unknown.get(key) || 0) + 1);
        err(`${where}: unknown exercise ${key}`);
      }
      if (!FOR.has(st.forMode)) err(`${where}: bad forMode ${st.forMode}`);
      if (st.forMode !== 'max' && st.forMode !== 'segment' && !(st.forValue > 0)) err(`${where}: forValue missing`);
      if (st.forMode === 'segment' && !(st.startSeconds >= 0)) err(`${where}: segment needs startSeconds`);
      if (st.role && !ROLES.has(st.role)) err(`${where}: bad role ${st.role}`);
      fors[st.forMode] = (fors[st.forMode] || 0) + 1;
    };
    if (w.score && !SCORES.has(w.score)) err(`bad score ${w.score}`);
    if (w.video && !(w.video.provider === 'youtube' && w.video.id)) err('bad video');
    (w.items || []).forEach((it, i) => {
      if (it.kind === 'ref') { if (!it.runsheetId) err(`item ${i}: ref needs runsheetId`); return; }
      if (it.role && !ROLES.has(it.role)) err(`item ${i}: bad role ${it.role}`);
      if (it.kind === 'block') {
        if (it.score && !SCORES.has(it.score)) err(`item ${i}: bad score ${it.score}`);
        const mode = it.mode ?? 'rounds';
        if (!MODES.has(mode)) err(`item ${i}: bad mode ${it.mode}`);
        modes[mode] = (modes[mode] || 0) + 1;
        if (mode !== 'amrap' && mode !== 'ladder' && !(it.repeat >= 1)) err(`item ${i}: block needs repeat`);
        if (mode === 'ladder' && !(Array.isArray(it.ladder) && it.ladder.length)) err(`item ${i}: ladder needs rungs`);
        if ((mode === 'amrap' || mode === 'emom') && !(it.timeCapSec > 0 || it.everySec > 0 || mode === 'emom')) err(`item ${i}: amrap needs timeCapSec`);
        if (!Array.isArray(it.steps) || !it.steps.length) err(`item ${i}: empty block`);
        (it.steps || []).forEach((st, j) => checkStep(st, `item ${i}.${j}`));
      } else checkStep(it, `item ${i}`);
    });
    n++;
  }
  summary.push([s, n, files.length - n]);
}
for (const [k, e] of newEx) {
  if (!GROUPS.has(e.group)) (console.error(`new-exercises (${e.src}): ${k} bad group ${e.group}`), errors++);
  if (typeof e.unit !== 'string' || !e.name || !(e.step > 0)) (console.error(`new-exercises (${e.src}): ${k} needs name/unit/step`), errors++);
}

console.log('\nsource                 ok  bad');
for (const [s, ok, bad] of summary) console.log(`${s.padEnd(22)} ${String(ok).padStart(3)} ${String(bad).padStart(4)}`);
console.log(`\nnew exercises: ${newEx.size}  modes: ${JSON.stringify(modes)}  forModes: ${JSON.stringify(fors)}`);
if (unknown.size) console.log('unknown keys:', [...unknown.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join(' '));
console.log(errors ? `\n${errors} error(s)` : '\nall valid');
process.exit(errors ? 1 : 0);
