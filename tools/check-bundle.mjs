// After `vite build`: what a phone must fetch before the first paint (the entry script and every
// chunk index.html preloads for it), gzipped. Fails the build when that grows past the budget or
// when the catalogue or the editor's drag and drop are back in it (review D12, 2026-11-15: 483 kB
// before, about 235 kB after).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const BUDGET_KB = 250;
const LATER = [/catalogue/, /vendor-edit/, /landing/, /coaching/, /workout-preview/, /editor-screen/, /import-csv/];

const dist = path.resolve(import.meta.dirname, '../dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const first = [...new Set([...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*rel="modulepreload"[^>]*\shref)="([^"]+\.js)"/g)].map(m => m[1].replace(/^\//, '')))];
const gz = f => zlib.gzipSync(fs.readFileSync(path.join(dist, f))).length;
const kb = n => (n / 1000).toFixed(1).padStart(7);

const rows = first.map(f => ({ f, n: gz(f) })).sort((a, b) => b.n - a.n);
const total = rows.reduce((t, r) => t + r.n, 0);
console.log('\nBefore first paint (gzip):');
for (const r of rows) console.log(`${kb(r.n)} kB  ${r.f}`);
console.log(`${kb(total)} kB  total (budget ${BUDGET_KB} kB)\n`);

const back = first.filter(f => LATER.some(re => re.test(f)));
if (back.length) {
  console.error(`These load after first paint and must not be in index.html: ${back.join(', ')}`);
  process.exit(1);
}
if (total > BUDGET_KB * 1000) {
  console.error(`First-load JS is ${(total / 1000).toFixed(1)} kB gzip, over the ${BUDGET_KB} kB budget. Load what was added after first paint (src/app/lazy.tsx) or raise the budget on purpose.`);
  process.exit(1);
}
