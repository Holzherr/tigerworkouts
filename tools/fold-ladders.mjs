// Folds runs of consecutive single-round `fortime` blocks that differ only in rep count
// (the "one block per rung" pattern: 21 / 15 / 9) into one `ladder` block. Idempotent.
// Run: node tools/fold-ladders.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.join(here, '../imports');
const dry = process.argv.includes('--dry');

const sig = b => b.steps.map(s => (s.kind === 'rest' ? `rest:${s.seconds}` : `${typeof s.exercise === 'string' ? s.exercise : s.exercise.key}:${s.forMode}:${s.forMode === 'reps' ? 'R' : s.forValue}:${s.target ?? ''}`)).join('|');
const rung = b => {
  const reps = b.steps.filter(s => s.kind === 'exercise' && s.forMode === 'reps').map(s => s.forValue);
  return reps.length && reps.every(r => r === reps[0]) ? reps[0] : null;
};
const isRung = b => b.kind === 'block' && (b.mode === 'fortime' || !b.mode) && (b.repeat ?? 1) === 1 && rung(b) !== null && b.steps.some(s => s.kind === 'exercise' && s.forMode === 'reps');

let folded = 0, files = 0;
for (const src of fs.readdirSync(root)) {
  const dir = path.join(root, src);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f === 'new-exercises.json') continue;
    const p = path.join(dir, f);
    const w = JSON.parse(fs.readFileSync(p, 'utf8'));
    const out = [];
    let i = 0, changed = false;
    while (i < w.items.length) {
      const b = w.items[i];
      if (!isRung(b)) { out.push(b); i++; continue; }
      let j = i + 1;
      while (j < w.items.length && isRung(w.items[j]) && sig(w.items[j]) === sig(b)) j++;
      if (j - i >= 2) {
        const rungs = w.items.slice(i, j).map(rung);
        const first = w.items[i];
        out.push({ ...first, name: rungs.join('-'), mode: 'ladder', repeat: 1, ladder: rungs, timeCapSec: first.timeCapSec, note: [first.note, ...w.items.slice(i + 1, j).map(x => x.note)].filter((n, k, a) => n && a.indexOf(n) === k).join(' · ') || undefined, steps: first.steps.map(s => (s.kind === 'exercise' && s.forMode === 'reps' ? { ...s, forValue: rungs[0] } : s)) });
        folded += j - i; changed = true;
      } else out.push(b);
      i = j;
    }
    if (changed) {
      files++;
      if (!dry) fs.writeFileSync(p, JSON.stringify({ ...w, items: out }, null, 2) + '\n');
    }
  }
}
console.log(`${dry ? '[dry] ' : ''}folded ${folded} rung blocks in ${files} files`);
