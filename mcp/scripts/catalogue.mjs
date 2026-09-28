// Bundles the public catalogue (imports/*/*.json) into one minified file the worker imports.
// imports/ stays the one source; the output is generated and git-ignored. Runs before dev, deploy,
// tests and type-checks (see package.json).
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../imports');
const out = path.resolve(import.meta.dirname, '../src/generated/catalogue.json');
const extra = [];
const workouts = [];
for (const source of readdirSync(root).sort()) {
  const dir = path.join(root, source);
  if (!statSync(dir).isDirectory()) continue;
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.json')) continue;
    const data = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    if (file === 'new-exercises.json') extra.push(...data);
    else workouts.push({ source, data });
  }
}
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ extra, workouts }));
console.log(`catalogue: ${workouts.length} workouts, ${extra.length} extra exercises → ${path.relative(process.cwd(), out)}`);
