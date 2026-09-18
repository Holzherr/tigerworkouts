// Exports imports/**.json into the v0.9 app's format as ../workout-hub/imported.js
// (IMPORTED_WORKOUTS + IMPORTED_EXERCISES). Lossy by design: the v0.9 timer only knows
// interval / sets / steady blocks, so AMRAP, for-time, ladders and EMOMs become the nearest
// shape with the original mode in the block name. Run: node tools/export-v09.mjs
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.join(here, '../imports');
const out = path.join(here, '../../workout-hub/imported.js');

const KIND_TAG = { benchmark: 'Benchmark', program: 'Program', video: 'Video', article: 'NHS', protocol: 'Protocol' };
const GROUP_ICON = { barbell: 'barbell', dumbbell: 'dumbbell', kettlebell: 'kettlebell', body: 'body', core: 'core', band: 'band', treadmill: 'treadmill', walk: 'walk', run: 'run', bike: 'bike', rower: 'rower', swim: 'swim', gym: 'body' };
const CARDIO = new Set(['cardio_run', 'cardio_walk', 'cardio_rower', 'cardio_bike', 'cardio_assault_bike', 'cardio_skierg', 'cardio_stairmaster', 'cardio_cross_trainer', 'cardio_swim', 'sprint', 'incline_walk', 'cardio_jump_rope']);

const key = s => (typeof s.exercise === 'string' ? s.exercise : s.exercise?.key);
const fmtClock = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const modeName = b => {
  const m = b.mode ?? 'rounds';
  if (m === 'amrap') return `AMRAP ${fmtClock(b.timeCapSec ?? 600)}`;
  if (m === 'emom') return `EMOM ${b.repeat}`;
  if (m === 'fortime') return `${b.repeat} round${b.repeat === 1 ? '' : 's'} for time`;
  if (m === 'ladder') return (b.ladder ?? []).join('-');
  return '';
};

function convert(it) {
  if (it.kind === 'rest' || it.kind === 'ref') return [];
  if (it.kind === 'exercise') return [loose(it)];
  const ex = it.steps.filter(s => s.kind === 'exercise');
  const rests = it.steps.filter(s => s.kind === 'rest');
  if (!ex.length) return [];
  const rest_s = rests[0]?.seconds ?? it.restBetweenSec ?? 0;
  const label = modeName(it);
  const name = label && !it.name.includes(label) ? `${it.name} · ${label}` : it.name;
  const timed = ex.filter(s => s.forMode === 'seconds');
  const mode = it.mode ?? 'rounds';
  const rounds = mode === 'amrap' ? Math.max(1, Math.round((it.timeCapSec ?? 600) / Math.max(30, it.steps.reduce((t, s) => t + est(s), 0)))) : mode === 'ladder' ? (it.ladder?.length ?? 1) : Math.max(1, it.repeat ?? 1);
  if (mode === 'emom') {
    return [{ name, type: 'interval', work_s: it.everySec ?? 60, rest_s: 0, rounds: it.repeat ?? 10, exercises: ex.map(s => ({ ex: key(s), target: s.target ?? (s.forMode === 'reps' ? undefined : s.target), note: s.forMode === 'reps' ? `${s.forValue} reps each minute` : undefined })) }];
  }
  if (timed.length === ex.length) {
    const work_s = mostCommon(timed.map(s => s.forValue)) ?? 30;
    return [{ name, type: 'interval', work_s, rest_s, rounds, exercises: ex.map(s => ({ ex: key(s), target: s.target, incline: s.incline })) }];
  }
  // reps-based (or mixed): a sets block; ladders use the first rung as reps and the rung count as sets
  return [{
    name,
    type: 'sets',
    rest_s: rest_s || 60,
    note: it.note,
    exercises: ex.map(s => ({
      ex: key(s),
      sets: rounds,
      reps: s.forMode === 'reps' || s.forMode === 'amrap' ? (mode === 'ladder' && !s.ladderFixed ? Math.round((it.ladder?.[0] ?? s.forValue) * (s.ladderFactor ?? 1)) : s.forValue) : s.forMode === 'seconds' ? Math.max(1, Math.round(s.forValue / 3)) : s.forMode === 'max' ? 1 : s.forValue,
      target: s.target,
      note: s.forMode === 'seconds' ? `${s.forValue}s` : s.forMode === 'meters' ? `${s.forValue} m` : s.forMode === 'calories' ? `${s.forValue} cal` : s.forMode === 'max' ? 'max reps' : s.forMode === 'amrap' ? `${s.forValue}+ reps` : s.forMode === 'minutes' ? `${s.forValue} min` : s.note,
    })),
  }];
}
function loose(s) {
  const k = key(s);
  if (CARDIO.has(k) && (s.forMode === 'minutes' || s.forMode === 'seconds' || s.forMode === 'meters')) {
    const secs = s.forMode === 'minutes' ? s.forValue * 60 : s.forMode === 'seconds' ? s.forValue : Math.round(s.forValue * 0.3);
    return { name: `${s.role === 'warmup' ? 'Warm-up: ' : s.role === 'cooldown' ? 'Cool-down: ' : ''}${nameOf(k)}${s.forMode === 'meters' ? ` ${s.forValue} m` : ''}`, type: 'steady', ex: k, incline: s.incline ?? 0, repeat: 1, segments: [{ s: Math.max(60, secs), speed: s.target ?? (k === 'cardio_walk' || k === 'incline_walk' ? 6 : 10) }] };
  }
  return { name: nameOf(k), type: 'sets', rest_s: 60, exercises: [{ ex: k, sets: 1, reps: s.forMode === 'reps' || s.forMode === 'amrap' ? s.forValue : s.forMode === 'seconds' ? Math.max(1, Math.round(s.forValue / 3)) : 1, target: s.target, note: s.forMode === 'seconds' ? `${s.forValue}s` : s.forMode === 'max' ? 'max' : s.forMode === 'meters' ? `${s.forValue} m` : undefined }] };
}
const est = s => (s.kind === 'rest' ? s.seconds : s.forMode === 'seconds' ? s.forValue : s.forMode === 'minutes' ? s.forValue * 60 : s.forMode === 'meters' ? s.forValue * 0.3 : (s.forValue || 10) * 3);
const mostCommon = arr => arr.sort((a, b) => arr.filter(v => v === a).length - arr.filter(v => v === b).length).pop();
let libNames = null;
function nameOf(k) {
  if (!libNames) {
    const src = fs.readFileSync(path.join(here, '../src/features/exercises/library.ts'), 'utf8');
    libNames = Object.fromEntries([...src.matchAll(/"key":"([^"]+)","name":"([^"]+)"/g)].map(m => [m[1], m[2]]));
  }
  return exercises[k]?.name ?? libNames[k] ?? k;
}

// ── run ──
const exercises = {};
const workouts = [];
for (const src of fs.readdirSync(root)) {
  const dir = path.join(root, src);
  if (!fs.statSync(dir).isDirectory()) continue;
  const nf = path.join(dir, 'new-exercises.json');
  if (fs.existsSync(nf)) for (const e of JSON.parse(fs.readFileSync(nf, 'utf8'))) exercises[e.key] ??= { name: e.name, icon: GROUP_ICON[e.group] ?? 'body', unit: e.unit ?? '', step: e.step ?? 1, video: '', cue: e.cue ?? '' };
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f === 'new-exercises.json') continue;
    const w = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const blocks = w.items.flatMap(convert).filter(Boolean);
    if (!blocks.length) continue;
    const kind = w.source?.kind ?? 'article';
    workouts.push({
      id: w.id,
      title: w.title,
      creator: w.source?.author ?? w.creator ?? 'Unknown',
      level: w.level ?? 'Medium',
      tags: [...new Set([KIND_TAG[kind] ?? 'Guide', ...(w.tags ?? [])])].slice(0, 5),
      created: w.source?.importedAt ?? '2026-09-06',
      description: w.description ?? '',
      source: { kind, url: w.source?.url ?? '', author: w.source?.author ?? '', license: w.source?.license ?? '' },
      program: w.program,
      video: w.video,
      blocks,
    });
  }
}

const body = `// Generated by workout-hub-next/tools/export-v09.mjs from workout-hub-next/imports. Do not edit.\n// ${workouts.length} public workouts converted to the v0.9 block shapes (lossy: see the tool header).\nconst IMPORTED_EXERCISES = ${JSON.stringify(exercises)};\nconst IMPORTED_WORKOUTS = ${JSON.stringify(workouts)};\n`;
fs.writeFileSync(out, body);
console.log(`wrote ${workouts.length} workouts, ${Object.keys(exercises).length} exercises, ${(body.length / 1024).toFixed(0)} KB → ${path.relative(process.cwd(), out)}`);
