// Bundles the timer view (widget/timer.ts + the app's runner engine) into one self-contained HTML
// string the worker serves as ui://tigerworkouts/timer.html. Output is generated and git-ignored;
// runs before dev, deploy, tests and type-checks (see package.json), like catalogue.mjs.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const here = path.resolve(import.meta.dirname, '..');
const res = await build({
  entryPoints: [path.join(here, 'widget/timer.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  alias: { '@': path.resolve(here, '../src') },
  legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync(path.join(here, 'widget/timer.html'), 'utf8').replace('/*BUNDLE*/', () => js);
const out = path.join(here, 'src/generated/widget.json');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ html }));
console.log(`widget: ${(html.length / 1024).toFixed(1)} KiB → ${path.relative(process.cwd(), out)}`);
