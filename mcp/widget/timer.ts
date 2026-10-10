/**
 * The timer view shown inside Claude (MCP Apps) and ChatGPT (Apps SDK, which speaks the same
 * MCP Apps bridge and keeps window.openai as an alias). Bundled by scripts/widget.mjs into one
 * self-contained HTML resource, ui://tigerworkouts/timer.html.
 *
 * The engine is the app's own: src/features/timer/runner.ts. This file only draws it and talks to
 * the host over postMessage (JSON-RPC, "ui/*" methods, protocol 2026-01-26).
 */
import { forLabel, loadLabel, type Runsheet } from '@/features/runsheet/model';
import * as R from '@/features/timer/runner';

interface StartOutput {
  title: string;
  runsheet: Runsheet;
  workoutId?: string;
  previewUrl?: string;
  appUrl?: string;
  appDownloadUrl?: string;
}

// ── host bridge ──
type Json = Record<string, unknown>;
interface OpenAiGlobals {
  toolOutput?: unknown;
  openExternal?: (a: { href: string }) => void;
  callTool?: (name: string, args: Json) => Promise<unknown>;
}
const openai = () => (window as unknown as { openai?: OpenAiGlobals }).openai;

let nextId = 1;
const pending = new Map<number, (v: { result?: unknown; error?: unknown }) => void>();
const post = (msg: Json) => window.parent?.postMessage({ jsonrpc: '2.0', ...msg }, '*');
const request = (method: string, params: Json, timeoutMs = 8000) =>
  new Promise<unknown>((resolve, reject) => {
    const id = nextId++;
    const t = setTimeout(() => (pending.delete(id), reject(new Error(`${method} timed out`))), timeoutMs);
    pending.set(id, r => (clearTimeout(t), r.error ? reject(r.error) : resolve(r.result)));
    post({ id, method, params });
  });
const notify = (method: string, params: Json = {}) => post({ method, params });
let bridged = false;

window.addEventListener('message', e => {
  if (e.source !== window.parent) return;
  const m = e.data as { id?: number; method?: string; params?: Json; result?: unknown; error?: unknown };
  if (!m || typeof m !== 'object') return;
  if (m.id !== undefined && !m.method) return void pending.get(m.id)?.(m);
  if (m.method === 'ui/notifications/tool-result') return void take(m.params?.structuredContent);
  if (m.method === 'ui/notifications/host-context-changed') return void theme((m.params as { theme?: string })?.theme);
  // Host requests we have nothing to do for still get an answer.
  if (m.id !== undefined && m.method) post({ id: m.id, result: {} });
});

const connect = async () => {
  try {
    const res = (await request('ui/initialize', { appInfo: { name: 'TigerWorkouts timer', version: '1' }, appCapabilities: {}, protocolVersion: '2026-01-26' })) as { hostContext?: { theme?: string } };
    bridged = true;
    theme(res?.hostContext?.theme);
    notify('ui/notifications/initialized');
    reportSize();
  } catch {
    // Not an MCP Apps host (or an old one): the window.openai alias below may still work.
  }
};

const openLink = (url: string) => {
  if (bridged) return void request('ui/open-link', { url }).catch(() => window.open(url, '_blank', 'noopener'));
  if (openai()?.openExternal) return openai()!.openExternal!({ href: url });
  window.open(url, '_blank', 'noopener');
};
const callTool = (name: string, args: Json) => (bridged ? request('tools/call', { name, arguments: args }, 15000) : openai()?.callTool ? openai()!.callTool!(name, args) : Promise.reject(new Error('no host')));

const theme = (t?: string) => {
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
};

// ── state ──
let out: StartOutput | null = null;
let state: R.RunState | null = null;
let logged: 'no' | 'saving' | 'yes' | 'failed' = 'no';
let lastBeep = -1;

const take = (sc: unknown) => {
  const v = sc as StartOutput | undefined;
  if (!v?.runsheet?.items || out) return;
  out = v;
  render();
};

// ── sound: three short beeps into the end of a countdown, one long at the end ──
let audio: AudioContext | null = null;
const beep = (long = false) => {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = long ? 660 : 880;
    g.gain.value = 0.08;
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + (long ? 0.45 : 0.12));
  } catch {
    /* no audio in this frame */
  }
};

// ── view ──
const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const mmss = (sec: number) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const slotTitle = (sl: R.Slot) => (sl.kind === 'rest' || sl.step.kind === 'rest' ? 'Rest' : sl.step.exercise.name);
const slotDetail = (s: R.RunState, sl: R.Slot) => {
  if (sl.step.kind !== 'exercise') return sl.blockName ? `${sl.blockName}` : '';
  const load = R.targetOf(s, sl);
  const step = load !== undefined ? { ...sl.step, target: load } : sl.step;
  const round = sl.rounds > 1 ? `Round ${sl.round + 1} of ${sl.rounds}` : '';
  return [forLabel(step), loadLabel(step), round].filter(Boolean).join(' · ');
};

const render = () => {
  const now = Date.now();
  if (!out) {
    $('main').innerHTML = `<p class="muted">Loading the workout…</p>`;
    return;
  }
  const s = state;
  const head = `<div class="head"><b>${esc(out.title)}</b>${s ? `<span class="muted">${mmss(R.elapsed(s, now))}</span>` : ''}</div>`;
  if (!s) {
    const steps = R.expand(out.runsheet).filter(sl => sl.kind === 'work').length;
    $('main').innerHTML = `${head}<p class="muted">${steps} sets. Keep this chat open while you train; the timer runs here.</p><button id="go" class="big">Start workout</button>`;
    $('go').onclick = () => ((state = R.start(out!.runsheet, Date.now())), (audio ??= new AudioContext()), render());
    return;
  }
  if (s.phase === 'done') {
    $('main').innerHTML = `${head}<div class="now"><div class="name">Done</div><div class="muted">${mmss(R.elapsed(s, now))} · ${s.slots.filter(sl => sl.kind === 'work' && s.actuals[sl.id]?.doneAt).length} sets</div></div>
<p class="muted" id="log">${logged === 'yes' ? 'Saved to your TigerWorkouts history.' : logged === 'saving' ? 'Saving…' : logged === 'failed' ? 'Could not save this session.' : ''}</p>
${logged === 'failed' ? '<button id="retry" class="ghost">Try saving again</button>' : ''}`;
    if (logged === 'failed') $('retry').onclick = save;
    return;
  }
  const cur = R.current(s);
  const nx = R.next(s);
  const cl = R.clock(s, now);
  const cap = R.capLeft(s, now);
  const lead = s.phase === 'lead' || (s.phase === 'paused' && s.pausedFrom === 'lead');
  const big = lead ? mmss(cl.left ?? 0) : cl.left !== undefined ? mmss(cl.left) : mmss(cl.spent);
  const name = lead ? 'Get ready' : s.phase === 'ready' ? `Next: ${cur?.blockName ?? (cur ? slotTitle(cur) : '')}` : cur ? slotTitle(cur) : '';
  const detail = lead && cur ? `First: ${slotTitle(cur)}` : cur ? slotDetail(s, cur) : '';
  const userPaced = !lead && s.phase !== 'ready' && cl.left === undefined;
  const primary = s.phase === 'ready' ? ['start', 'Start block'] : s.phase === 'paused' ? ['resume', 'Resume'] : userPaced ? ['done', 'Done'] : ['pause', 'Pause'];
  $('main').innerHTML = `${head}<div class="bar"><i style="width:${Math.round(R.overall(s, now) * 100)}%"></i></div>
<div class="now ${cur?.kind === 'rest' && !lead ? 'rest' : ''}"><div class="clock">${big}</div><div class="name">${esc(name)}</div><div class="muted">${esc(detail)}${cap !== undefined ? ` · cap ${mmss(cap)}` : ''}</div></div>
<button id="primary" class="big">${primary[1]}</button>
<div class="row"><button id="back" class="ghost">Back</button><button id="skip" class="ghost">${userPaced || s.phase === 'ready' ? 'Skip' : 'Next'}</button><button id="end" class="ghost">End</button></div>
${nx && !lead && s.phase !== 'ready' ? `<p class="muted">Up next: ${esc(slotTitle(nx))}${nx.step.kind === 'exercise' ? ` · ${esc(slotDetail(s, nx))}` : nx.seconds ? ` · ${nx.seconds}s` : ''}</p>` : ''}`;
  $('primary').onclick = () => act(primary[0]);
  $('back').onclick = () => act('back');
  $('skip').onclick = () => act('skip');
  $('end').onclick = () => act('end');
};

const act = (what: string) => {
  if (!state) return;
  const now = Date.now();
  if (what === 'start') state = R.startBlock(state, now);
  else if (what === 'pause') state = R.pause(state, now);
  else if (what === 'resume') state = R.resume(state, now);
  else if (what === 'done') state = R.advance(state, now);
  else if (what === 'skip') state = R.advance(state, now, { skipped: state.phase === 'running' && R.clock(state, now).left === undefined });
  else if (what === 'back') state = R.back(state, now);
  else if (what === 'end') state = R.finish(state, now);
  after();
};

const after = () => {
  if (state?.phase === 'done' && logged === 'no' && R.didWork(state)) void save();
  render();
};

/** Log the finished session through the server's log_session tool (same table the apps use). */
const save = async () => {
  if (!state || !out) return;
  logged = 'saving';
  render();
  const r = R.toResult(state, out.runsheet, state.endedAt ?? Date.now());
  try {
    const res = (await callTool('log_session', {
      id: R.sessionId(state),
      workoutId: out.workoutId ?? r.runsheetId,
      title: out.title,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      durationSec: r.durationSec,
      completed: r.completed,
      score: r.score,
      scoreText: r.scoreText,
      steps: r.steps,
    })) as { isError?: boolean } | undefined;
    logged = res?.isError ? 'failed' : 'yes';
  } catch {
    logged = 'failed';
  }
  render();
};

setInterval(() => {
  if (!state || state.phase === 'done') return;
  const before = state;
  const now = Date.now();
  state = R.tick(state, now);
  const left = R.clock(state, now).left;
  if (state.phase === 'running' || state.phase === 'lead') {
    const whole = left !== undefined ? Math.ceil(left) : -1;
    if (whole > 0 && whole <= 3 && whole !== lastBeep) beep();
    lastBeep = whole;
  }
  if (state !== before && before.i !== state.i) beep(true);
  if (state !== before) after();
  else render();
}, 250);

// Links out of the chat: the app for the lock-screen timer and notifications, the web page as fallback.
$('app').onclick = e => (e.preventDefault(), openLink(out?.appDownloadUrl ?? (e.currentTarget as HTMLAnchorElement).href));
$('web').onclick = e => (e.preventDefault(), openLink(out?.appUrl ?? out?.previewUrl ?? 'https://tigerworkouts.com/'));

// Report the content's height so the host sizes the frame to it.
const wrap = document.querySelector('.wrap')!;
let sent = 0;
function reportSize() {
  const height = Math.ceil(wrap.getBoundingClientRect().height);
  if (!bridged || height === sent) return;
  sent = height;
  notify('ui/notifications/size-changed', { width: document.documentElement.clientWidth, height });
}
new ResizeObserver(reportSize).observe(wrap);

// ChatGPT alias: the output may already be on window.openai, or arrive with a globals event.
const fromOpenai = () => take(openai()?.toolOutput);
window.addEventListener('openai:set_globals', fromOpenai);
fromOpenai();
render();
void connect();
