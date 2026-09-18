// One-off migrations over imports/**.json after model changes. Idempotent. Run: node tools/migrate-imports.mjs
//  1. trailing rest step in a repeating block → restBetweenSec
//  2. loose warm-up / cool-down steps (name or key) → role
//  3. YouTube: runsheet.video from source.url; explicit score where the mode can't tell
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '../imports');
const key = s => (typeof s.exercise === 'string' ? s.exercise : s.exercise?.key) ?? '';
let a = 0, b = 0, c = 0, files = 0;
for (const src of fs.readdirSync(root)) {
  const dir = path.join(root, src);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f === 'new-exercises.json') continue;
    const p = path.join(dir, f);
    const w = JSON.parse(fs.readFileSync(p, 'utf8'));
    const before = JSON.stringify(w);
    // 1
    for (const it of w.items) {
      if (it.kind !== 'block' || !(it.repeat > 1) || it.restBetweenSec) continue;
      const last = it.steps.at(-1);
      const rests = it.steps.filter(s => s.kind === 'rest').length;
      if (last?.kind === 'rest' && rests === 1 && it.steps.length > 1 && (it.mode === 'amrap' || it.mode === 'fortime' || /between (rounds|sets|cycles)/i.test(last.note ?? ''))) {
        it.restBetweenSec = last.seconds;
        it.steps = it.steps.slice(0, -1);
        a++;
      }
    }
    // 2
    const n = w.items.length;
    w.items.forEach((it, i) => {
      if (it.kind === 'block' || it.kind === 'ref' || it.role) return;
      const k = key(it);
      const nm = `${k} ${it.note ?? ''}`.toLowerCase();
      if (/warm[_ -]?up/.test(nm) || (i === 0 && n > 1 && k === 'cardio_walk' && it.forMode === 'minutes')) { it.role = 'warmup'; b++; }
      else if (/cool[_ -]?down|stretch/.test(nm) || (i === n - 1 && n > 1 && k === 'cardio_walk' && it.forMode === 'minutes')) { it.role = 'cooldown'; b++; }
    });
    // 3
    if (w.source?.kind === 'video' && !w.video) {
      const m = w.source.url?.match(/[?&]v=([\w-]{11})/) || w.source.url?.match(/youtu\.be\/([\w-]{11})/);
      if (m) { w.video = { provider: 'youtube', id: m[1], url: w.source.url }; c++; }
    }
    if (!w.score) {
      const t = `${w.title} ${w.description ?? ''}`.toLowerCase();
      if (/fight gone bad|total reps|score is the total/.test(t)) w.score = 'reps';
      else if (/12-minute run|cooper|as far as/.test(t)) w.score = 'distance';
      else if (/\b[13]rm\b|for load|heaviest/.test(t)) w.score = 'load';
    }
    const after = JSON.stringify(w);
    if (after !== before) { fs.writeFileSync(p, JSON.stringify(w, null, 2) + '\n'); files++; }
  }
}
console.log(`restBetween: ${a}, roles: ${b}, videos: ${c}, files changed: ${files}`);
